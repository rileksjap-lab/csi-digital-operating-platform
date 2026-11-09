import pool, { query } from "@/lib/db/pool";
import { insertAuditEntry } from "@/lib/db/audit";
import type { AuthSession } from "@/lib/types/api";
import { localTodayIso } from "@/lib/dates";
import {
  allowedLeaveActions, balanceOf, initialStatus, leaveDays, leaveDaysInYear, statusAfterApprove,
  type DayPart, type LeaveActor, type LeaveAction, type LeaveStatus,
} from "@/lib/leave/rules";
import { notifyLeaveStep } from "@/lib/email/leave-notify";

// Leave requests: applying, the approval route (Solution Manager, then HOD), the
// team planner and each person's balances. Rules live in lib/leave/rules.ts.
// Everything is scoped to the caller's department.

export type Fail = { ok: false; status: 400 | 403 | 404 | 409; message: string };
export type Done<T> = { ok: true; value: T };
export type Result<T> = Done<T> | Fail;
const fail = (status: Fail["status"], message: string): Fail => ({ ok: false, status, message });
const done = <T>(value: T): Done<T> => ({ ok: true, value });

const MAX_RANGE_DAYS = 90;

// ── Settings and helpers ────────────────────────────────────────────────────

export interface ActingApprover { staffId: string; from: string; to: string }

export async function getActingApprover(): Promise<ActingApprover | null> {
  const r = await query<{ value: ActingApprover }>(`SELECT value FROM leave_setting WHERE key = 'actingApprover'`);
  return r.rows[0]?.value ?? null;
}

export async function actorOf(session: AuthSession): Promise<LeaveActor> {
  const a = await getActingApprover();
  const today = localTodayIso();
  return { staffId: session.staffId, role: session.role, actingForHod: !!a && a.staffId === session.staffId && a.from <= today && today <= a.to };
}

export async function loadHolidays(from: string, to: string): Promise<Set<string>> {
  const r = await query<{ d: string }>(
    `SELECT to_char(holidaydate, 'YYYY-MM-DD') AS d FROM public_holiday WHERE holidaydate BETWEEN $1 AND $2`, [from, to]);
  return new Set(r.rows.map((x) => x.d));
}

export async function listLeaveTypes(activeOnly = true) {
  const r = await query(
    `SELECT id, code, name, colour, trackbalance AS "trackBalance", halfdayallowed AS "halfDayAllowed", active, sortorder AS "sortOrder"
     FROM leave_type ${activeOnly ? "WHERE active" : ""} ORDER BY sortorder, name`);
  return r.rows;
}

/** Active team members, for the "who covers for you" choice. */
export async function listColleagues(session: AuthSession) {
  const r = await query(
    `SELECT id, name FROM staff WHERE deptid = $1 AND status IN ('Active','OnLeave') AND id <> $2 ORDER BY name`,
    [session.departmentId, session.staffId]);
  return r.rows;
}

// ── Requests ────────────────────────────────────────────────────────────────

interface RequestRow {
  id: string; staffId: string; staffName: string; staffDeptId: string; staffRoleCode: string; subTeam: string | null;
  leaveTypeId: string; typeCode: string; typeName: string; colour: string; trackBalance: boolean;
  startDate: string; endDate: string; dayPart: DayPart; days: number; reason: string | null;
  coverStaffId: string | null; coverName: string | null; status: LeaveStatus;
  smDecidedByName: string | null; hodDecidedByName: string | null; decisionNote: string | null; createdAt: string;
}

const REQUEST_SQL = `
  SELECT q.id, q.staffid AS "staffId", s.name AS "staffName", s.deptid AS "staffDeptId", r.rolecode AS "staffRoleCode", s.subteam AS "subTeam",
         q.leavetypeid AS "leaveTypeId", t.code AS "typeCode", t.name AS "typeName", t.colour, t.trackbalance AS "trackBalance",
         to_char(q.startdate, 'YYYY-MM-DD') AS "startDate", to_char(q.enddate, 'YYYY-MM-DD') AS "endDate",
         q.daypart AS "dayPart", q.days::float AS days, q.reason, q.coverstaffid AS "coverStaffId", cv.name AS "coverName", q.status,
         sm.name AS "smDecidedByName", hd.name AS "hodDecidedByName", q.decisionnote AS "decisionNote", q.createdat AS "createdAt"
  FROM leave_request q
  JOIN staff s ON s.id = q.staffid JOIN role r ON r.id = s.roleid
  JOIN leave_type t ON t.id = q.leavetypeid
  LEFT JOIN staff cv ON cv.id = q.coverstaffid
  LEFT JOIN staff sm ON sm.id = q.smdecidedby
  LEFT JOIN staff hd ON hd.id = q.hoddecidedby`;

function present(row: RequestRow, actor: LeaveActor, today: string) {
  return { ...row, actions: allowedLeaveActions({ status: row.status, staffId: row.staffId, endDate: row.endDate }, actor, today) };
}

export async function createRequest(
  session: AuthSession,
  input: { leaveTypeId: string; startDate: string; endDate: string; dayPart: DayPart; reason?: string | null; coverStaffId?: string | null }
): Promise<Result<{ id: string; status: LeaveStatus; days: number; balanceAfter: number | null }>> {
  if (input.endDate < input.startDate) return fail(400, "The end date is before the start date");
  if (input.dayPart !== "Full" && input.startDate !== input.endDate) return fail(400, "A half day is for a single date");

  const type = (await query<{ id: string; name: string; trackbalance: boolean; halfdayallowed: boolean; active: boolean }>(
    `SELECT id, name, trackbalance, halfdayallowed, active FROM leave_type WHERE id = $1`, [input.leaveTypeId])).rows[0];
  if (!type || !type.active) return fail(400, "Choose a leave type from the list");
  if (input.dayPart !== "Full" && !type.halfdayallowed) return fail(400, `${type.name} cannot be taken as a half day`);

  const holidays = await loadHolidays(addDays(input.startDate, -1), addDays(input.endDate, 1));
  const days = leaveDays(input.startDate, input.endDate, input.dayPart, holidays);
  if (days <= 0) return fail(400, "These dates are all weekends or public holidays, so no leave is needed");
  if ((Date.parse(input.endDate) - Date.parse(input.startDate)) / 86_400_000 > MAX_RANGE_DAYS) return fail(400, `A single request can cover at most ${MAX_RANGE_DAYS} days`);

  if (input.coverStaffId) {
    const cv = await query(`SELECT 1 FROM staff WHERE id = $1 AND deptid = $2 AND status IN ('Active','OnLeave') AND id <> $3`, [input.coverStaffId, session.departmentId, session.staffId]);
    if (cv.rows.length === 0) return fail(400, "Choose someone from your department to cover for you");
  }

  // The same person cannot book the same day twice (an AM and a PM half day on one date may sit side by side).
  const clash = await query<{ daypart: string; startdate: string; enddate: string }>(
    `SELECT daypart FROM leave_request WHERE staffid = $1 AND status IN ('PendingSM','PendingHOD','Approved') AND startdate <= $3 AND enddate >= $2`,
    [session.staffId, input.startDate, input.endDate]);
  const blocked = clash.rows.some((c) => !(c.daypart !== "Full" && input.dayPart !== "Full" && c.daypart !== input.dayPart));
  if (blocked) return fail(409, "You already have leave requested on some of these dates");

  const sm = await query(`SELECT 1 FROM staff s JOIN role r ON r.id = s.roleid WHERE s.deptid = $1 AND r.rolecode = 'SM' AND s.status = 'Active' AND s.id <> $2 LIMIT 1`, [session.departmentId, session.staffId]);
  const status = initialStatus(session.role, sm.rows.length > 0);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO leave_request (staffid, leavetypeid, startdate, enddate, daypart, days, reason, coverstaffid, status,
                                  hoddecidedby, hoddecidedat, decisionnote)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [session.staffId, input.leaveTypeId, input.startDate, input.endDate, input.dayPart, days, input.reason?.trim() || null, input.coverStaffId || null, status,
       status === "Approved" ? session.staffId : null, status === "Approved" ? new Date() : null, status === "Approved" ? "Recorded by the approver" : null]);
    const id = ins.rows[0].id;
    await insertAuditEntry(
      { entityName: "LEAVE_REQUEST", entityId: id, action: "Insert", fieldName: "Status", newValue: status, reason: `${type.name}: ${input.startDate} to ${input.endDate} (${days} day${days === 1 ? "" : "s"})`, performedBy: session.staffId },
      client
    );
    await client.query("COMMIT");

    notifyLeaveStep({ kind: "submitted", requestId: id, status, requesterId: session.staffId, requesterName: session.displayName, deptId: session.departmentId, typeName: type.name, startDate: input.startDate, endDate: input.endDate, days, reason: input.reason ?? null, coverStaffId: input.coverStaffId ?? null, actorId: session.staffId, actorName: session.displayName, note: null });

    let balanceAfter: number | null = null;
    if (type.trackbalance) {
      const year = Number(input.startDate.slice(0, 4));
      const b = (await balancesFor(session.staffId, year)).find((x) => x.leaveTypeId === input.leaveTypeId);
      balanceAfter = b ? b.balance : null;
    }
    return done({ id, status, days, balanceAfter });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listRequests(
  session: AuthSession,
  opts: { scope: "mine" | "team" | "pending"; year?: number; from?: string; to?: string }
) {
  const actor = await actorOf(session);
  const today = localTodayIso();
  const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = [];

  if (opts.scope === "mine") {
    where.push(`q.staffid = ${p(session.staffId)}`);
    const y = opts.year ?? Number(today.slice(0, 4));
    where.push(`q.startdate <= ${p(`${y}-12-31`)} AND q.enddate >= ${p(`${y}-01-01`)}`);
  } else if (opts.scope === "team") {
    where.push(`s.deptid = ${p(session.departmentId)}`, `q.status IN ('PendingSM','PendingHOD','Approved')`);
    where.push(`q.startdate <= ${p(opts.to ?? addDays(today, 60))} AND q.enddate >= ${p(opts.from ?? addDays(today, -7))}`);
  } else {
    where.push(`s.deptid = ${p(session.departmentId)}`, `q.staffid <> ${p(session.staffId)}`);
    const isHod = session.role === "HOD" || session.role === "SVP";
    if (isHod) where.push(`q.status IN ('PendingSM','PendingHOD')`);
    else if (actor.actingForHod) where.push(`q.status IN ('PendingSM','PendingHOD')`);
    else if (session.role === "SolutionManager") where.push(`q.status = 'PendingSM'`);
    else where.push(`FALSE`);
  }

  const res = await query<RequestRow>(`${REQUEST_SQL} WHERE ${where.join(" AND ")} ORDER BY q.startdate, s.name`, params);
  return res.rows.map((r) => present(r, actor, today));
}

export async function decide(
  id: string, session: AuthSession, action: LeaveAction, note?: string | null
): Promise<Result<{ status: LeaveStatus }>> {
  const actor = await actorOf(session);
  const today = localTodayIso();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query<RequestRow>(`${REQUEST_SQL} WHERE q.id = $1 FOR UPDATE OF q`, [id]);
    const r = res.rows[0];
    if (!r || r.staffDeptId !== session.departmentId) { await client.query("ROLLBACK"); return fail(404, "Leave request not found"); }
    if (!allowedLeaveActions({ status: r.status, staffId: r.staffId, endDate: r.endDate }, actor, today).includes(action)) {
      await client.query("ROLLBACK");
      return fail(403, "You cannot do this on this request right now");
    }
    const reason = note?.trim() || null;
    if (action === "reject" && !reason) { await client.query("ROLLBACK"); return fail(400, "Please say why it is not approved"); }

    const hodStage = r.status === "PendingHOD" || session.role === "HOD" || session.role === "SVP";
    let to: LeaveStatus;
    const sets: string[] = ["updatedat = now()"];
    const params: unknown[] = [id];
    const set = (frag: string, v: unknown) => { params.push(v); sets.push(frag.replace("?", `$${params.length}`)); };

    if (action === "approve") {
      to = statusAfterApprove(r.status, session.role);
      if (to === "PendingHOD") { set("smdecidedby = ?", session.staffId); sets.push("smdecidedat = now()"); }
      else { set("hoddecidedby = ?", session.staffId); sets.push("hoddecidedat = now()"); }
    } else if (action === "reject") {
      to = "Rejected";
      if (hodStage) { set("hoddecidedby = ?", session.staffId); sets.push("hoddecidedat = now()"); }
      else { set("smdecidedby = ?", session.staffId); sets.push("smdecidedat = now()"); }
    } else {
      to = "Cancelled";
      sets.push("cancelledat = now()");
    }
    if (reason) set("decisionnote = ?", reason);
    set("status = ?", to);
    await client.query(`UPDATE leave_request SET ${sets.join(", ")} WHERE id = $1`, params);

    const delegated = actor.actingForHod && session.role === "SolutionManager" && r.status === "PendingHOD";
    await insertAuditEntry(
      {
        entityName: "LEAVE_REQUEST", entityId: id,
        action: action === "approve" ? "Approve" : action === "reject" ? "Return" : "StatusChange",
        fieldName: "Status", oldValue: r.status, newValue: to,
        reason: (delegated ? `Acting for the HOD${reason ? `: ${reason}` : ""}` : reason) || null,
        performedBy: session.staffId,
      },
      client
    );
    await client.query("COMMIT");

    notifyLeaveStep({
      kind: action === "approve" ? (to === "Approved" ? "approved" : "needsHod") : action === "reject" ? "rejected" : "cancelled",
      requestId: id, status: to, requesterId: r.staffId, requesterName: r.staffName, deptId: r.staffDeptId, typeName: r.typeName,
      startDate: r.startDate, endDate: r.endDate, days: r.days, reason: r.reason, coverStaffId: r.coverStaffId,
      actorId: session.staffId, actorName: session.displayName, note: reason, wasApproved: r.status === "Approved",
    });
    return done({ status: to });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Balances ────────────────────────────────────────────────────────────────

export async function balancesFor(staffId: string, year: number) {
  const types = await query<{ id: string; code: string; name: string; colour: string }>(
    `SELECT id, code, name, colour FROM leave_type WHERE trackbalance AND active ORDER BY sortorder`);
  const bal = await query<{ leaveTypeId: string; entitled: number; carriedForward: number; adjustment: number }>(
    `SELECT leavetypeid AS "leaveTypeId", entitled::float AS entitled, carriedforward::float AS "carriedForward", adjustment::float AS adjustment
     FROM leave_balance WHERE staffid = $1 AND year = $2`, [staffId, year]);
  const reqs = await query<{ leaveTypeId: string; startDate: string; endDate: string; dayPart: DayPart; status: LeaveStatus }>(
    `SELECT leavetypeid AS "leaveTypeId", to_char(startdate,'YYYY-MM-DD') AS "startDate", to_char(enddate,'YYYY-MM-DD') AS "endDate", daypart AS "dayPart", status
     FROM leave_request WHERE staffid = $1 AND status IN ('PendingSM','PendingHOD','Approved') AND startdate <= $3 AND enddate >= $2`,
    [staffId, `${year}-01-01`, `${year}-12-31`]);
  const holidays = await loadHolidays(`${year - 1}-12-25`, `${year + 1}-01-05`);

  return types.rows.map((t) => {
    const b = bal.rows.find((x) => x.leaveTypeId === t.id);
    let approved = 0, pending = 0;
    for (const q of reqs.rows.filter((x) => x.leaveTypeId === t.id)) {
      const d = leaveDaysInYear(q.startDate, q.endDate, q.dayPart, holidays, year);
      if (q.status === "Approved") approved += d; else pending += d;
    }
    const inputs = { entitled: b?.entitled ?? 0, carriedForward: b?.carriedForward ?? 0, adjustment: b?.adjustment ?? 0 };
    return {
      leaveTypeId: t.id, code: t.code, name: t.name, colour: t.colour, configured: !!b,
      ...inputs, approved, pending, balance: balanceOf(inputs, approved, pending),
    };
  });
}

// ── Team planner ────────────────────────────────────────────────────────────

export async function plannerFor(session: AuthSession, year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const [staff, leaves, holidays] = await Promise.all([
    query(`SELECT id, name, subteam AS "subTeam" FROM staff WHERE deptid = $1 AND status IN ('Active','OnLeave') ORDER BY name`, [session.departmentId]),
    query(
      `SELECT q.id, q.staffid AS "staffId", to_char(q.startdate,'YYYY-MM-DD') AS "startDate", to_char(q.enddate,'YYYY-MM-DD') AS "endDate",
              q.daypart AS "dayPart", q.status, q.reason, t.code AS "typeCode", t.name AS "typeName", t.colour
       FROM leave_request q JOIN staff s ON s.id = q.staffid JOIN leave_type t ON t.id = q.leavetypeid
       WHERE s.deptid = $1 AND q.status IN ('PendingSM','PendingHOD','Approved') AND q.startdate <= $3 AND q.enddate >= $2`,
      [session.departmentId, from, to]),
    query(`SELECT to_char(holidaydate,'YYYY-MM-DD') AS date, name FROM public_holiday WHERE holidaydate BETWEEN $1 AND $2 ORDER BY holidaydate`, [from, to]),
  ]);
  return { staff: staff.rows, leaves: leaves.rows, holidays: holidays.rows };
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
