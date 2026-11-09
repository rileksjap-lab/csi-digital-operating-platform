import { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";
import { applyScopeFilter } from "@/lib/db/repo-utils";
import { eachDay, isWorkingDay, type DayPart } from "@/lib/leave/rules";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "wo_deadline" | "tender_closing" | "cert_expiry" | "leave";
  meta?: string;
}

export async function getCalendarEvents(
  startDate: string,
  endDate: string,
  scope: ScopeFilter
): Promise<CalendarEvent[]> {
  const woParams: unknown[] = [startDate, endDate];
  let woWhere = "";
  const sf = applyScopeFilter(scope, "w", 3);
  if (sf.clause) {
    woWhere = sf.clause;
    woParams.push(...sf.params);
  }

  const [woEvents, tenderEvents, certEvents, leaveRows, holidayRows] = await Promise.all([
    // WO deadlines are scope-restricted, same as the /wo list — a Self/Pod-
    // scoped viewer must not see other people's WO deadlines on the calendar.
    query<{ id: string; title: string; date: string; meta: string }>(
      `SELECT w.id, w.csi_wo_no || ' — ' || w.title AS title,
              to_char(w.duedate, 'YYYY-MM-DD') AS date,
              w.status AS meta
       FROM csi_wo w
       WHERE w.duedate >= $1::date AND w.duedate < $2::date
         AND w.status NOT IN ('Closed', 'Cancelled')
         ${woWhere}
       ORDER BY w.duedate`,
      woParams
    ),
    // Tender Pipeline is an intentionally shared, unscoped module (same as
    // /api/tender itself) — every authenticated user can see every tender.
    query<{ id: string; title: string; date: string; meta: string }>(
      `SELECT id, tenderno || ' — ' || tendername || ' (' || client || ')' AS title,
              to_char(closingdate, 'YYYY-MM-DD') AS date,
              status AS meta
       FROM tender
       WHERE closingdate >= $1::date AND closingdate < $2::date
         AND status NOT IN ('Won', 'Lost', 'Cancelled')
       ORDER BY closingdate`,
      [startDate, endDate]
    ),
    query<{ id: string; title: string; date: string; meta: string }>(
      `SELECT c.id, s.name || ' — ' || c.certificationname AS title,
              to_char(c.expirydate, 'YYYY-MM-DD') AS date,
              c.status AS meta
       FROM certification c
       JOIN staff s ON s.id = c.staffid
       WHERE c.expirydate >= $1::date AND c.expirydate < $2::date
       ORDER BY c.expirydate`,
      [startDate, endDate]
    ),
    // Approved leave of the viewer's department. Everyone in the team sees it (the leave planner is open to the team).
    query<{ id: string; name: string; typeName: string; startDate: string; endDate: string; dayPart: DayPart }>(
      `SELECT q.id, s.name, t.name AS "typeName", to_char(q.startdate, 'YYYY-MM-DD') AS "startDate",
              to_char(q.enddate, 'YYYY-MM-DD') AS "endDate", q.daypart AS "dayPart"
       FROM leave_request q
       JOIN staff s ON s.id = q.staffid
       JOIN leave_type t ON t.id = q.leavetypeid
       WHERE s.deptid = $3 AND q.status = 'Approved' AND q.startdate < $2::date AND q.enddate >= $1::date
       ORDER BY q.startdate, s.name`,
      [startDate, endDate, scope.departmentId]
    ),
    query<{ d: string }>(`SELECT to_char(holidaydate, 'YYYY-MM-DD') AS d FROM public_holiday WHERE holidaydate >= $1::date AND holidaydate < $2::date`, [startDate, endDate]),
  ]);

  // One entry per person per working day inside the month (weekends and public holidays are not leave days).
  const holidays = new Set(holidayRows.rows.map((h) => h.d));
  const lastDay = new Date(Date.parse(endDate) - 86_400_000).toISOString().slice(0, 10);
  const leaveEvents: CalendarEvent[] = [];
  for (const r of leaveRows.rows) {
    const from = r.startDate > startDate ? r.startDate : startDate;
    const to = r.endDate < lastDay ? r.endDate : lastDay;
    const half = r.dayPart === "AM" ? " (morning)" : r.dayPart === "PM" ? " (afternoon)" : "";
    for (const day of eachDay(from, to)) {
      if (!isWorkingDay(day, holidays)) continue;
      leaveEvents.push({
        id: `${r.id}-${day}`, title: `${r.name} — ${r.typeName}${half}`, date: day, type: "leave",
        meta: r.startDate === r.endDate ? "On leave" : `On leave ${r.startDate} to ${r.endDate}`,
      });
    }
  }

  return [
    ...woEvents.rows.map((r) => ({ ...r, type: "wo_deadline" as const })),
    ...tenderEvents.rows.map((r) => ({ ...r, type: "tender_closing" as const })),
    ...certEvents.rows.map((r) => ({ ...r, type: "cert_expiry" as const })),
    ...leaveEvents,
  ];
}
