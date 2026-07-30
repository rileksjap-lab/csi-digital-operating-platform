import { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";
import { applyScopeFilter } from "@/lib/db/repo-utils";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "wo_deadline" | "tender_closing" | "cert_expiry";
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

  const [woEvents, tenderEvents, certEvents] = await Promise.all([
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
  ]);

  return [
    ...woEvents.rows.map((r) => ({ ...r, type: "wo_deadline" as const })),
    ...tenderEvents.rows.map((r) => ({ ...r, type: "tender_closing" as const })),
    ...certEvents.rows.map((r) => ({ ...r, type: "cert_expiry" as const })),
  ];
}
