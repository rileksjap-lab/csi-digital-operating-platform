import { query } from "@/lib/db/pool";
import { insertAuditEntry } from "@/lib/db/audit";
import type { AuthSession } from "@/lib/types/api";
import { entitlementFor, yearsOfService } from "@/lib/leave/rules";
import type { LeaveConfigOp } from "@/lib/validations/leave.schema";
import { getActingApprover, listLeaveTypes, type Result } from "@/lib/repositories/leave.repo";

// Leave setup for the HOD: leave types, entitlement rules by years of service,
// per-person balances, public holidays and who approves for the HOD while away.

const fail = (status: 400 | 403 | 404 | 409, message: string): Result<never> => ({ ok: false, status, message });
const done = <T>(value: T): Result<T> => ({ ok: true, value });

export async function getLeaveConfig(session: AuthSession, year: number) {
  const dept = session.departmentId;
  const [types, rules, holidays, people, balances, candidates, acting] = await Promise.all([
    listLeaveTypes(false),
    query(`SELECT id, leavetypeid AS "leaveTypeId", minyears::float AS "minYears", days::float AS days FROM leave_entitlement_rule ORDER BY leavetypeid, minyears`),
    query(`SELECT id, to_char(holidaydate,'YYYY-MM-DD') AS date, name FROM public_holiday WHERE holidaydate BETWEEN $1 AND $2 ORDER BY holidaydate`, [`${year}-01-01`, `${year}-12-31`]),
    query(`SELECT id, name, to_char(joindate,'YYYY-MM-DD') AS "joinDate" FROM staff WHERE deptid = $1 AND status IN ('Active','OnLeave') ORDER BY name`, [dept]),
    query(
      `SELECT b.staffid AS "staffId", b.leavetypeid AS "leaveTypeId", b.entitled::float AS entitled, b.carriedforward::float AS "carriedForward",
              b.adjustment::float AS adjustment, b.note
       FROM leave_balance b JOIN staff s ON s.id = b.staffid WHERE s.deptid = $1 AND b.year = $2`, [dept, year]),
    query(`SELECT s.id, s.name FROM staff s JOIN role r ON r.id = s.roleid WHERE s.deptid = $1 AND r.rolecode = 'SM' AND s.status = 'Active' ORDER BY s.name`, [dept]),
    getActingApprover(),
  ]);
  return { year, types, rules: rules.rows, holidays: holidays.rows, people: people.rows, balances: balances.rows, approverCandidates: candidates.rows, actingApprover: acting };
}

async function audit(session: AuthSession, entityId: string, field: string, value: string) {
  await insertAuditEntry({ entityName: "LEAVE_CONFIG", entityId, action: "Update", fieldName: field, newValue: value, performedBy: session.staffId });
}

export async function applyLeaveConfig(session: AuthSession, op: LeaveConfigOp): Promise<Result<Record<string, unknown>>> {
  const dept = session.departmentId;
  const inDept = async (staffId: string) =>
    (await query(`SELECT 1 FROM staff WHERE id = $1 AND deptid = $2`, [staffId, dept])).rows.length > 0;

  switch (op.op) {
    case "type.save": {
      if (op.id) {
        const r = await query<{ id: string }>(
          `UPDATE leave_type SET name = $2, colour = $3, trackbalance = $4, halfdayallowed = $5, active = $6 WHERE id = $1 RETURNING id`,
          [op.id, op.name.trim(), op.colour, op.trackBalance, op.halfDayAllowed, op.active]);
        if (r.rows.length === 0) return fail(404, "Leave type not found");
        await audit(session, op.id, "Leave type", op.name);
        return done({ id: op.id });
      }
      if (!op.code) return fail(400, "Give the new leave type a short code, for example STUDY2");
      const dup = await query(`SELECT 1 FROM leave_type WHERE code = $1`, [op.code]);
      if (dup.rows.length > 0) return fail(409, "That code is already used");
      const r = await query<{ id: string }>(
        `INSERT INTO leave_type (code, name, colour, trackbalance, halfdayallowed, active, sortorder)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(sortorder) FROM leave_type), 0) + 10) RETURNING id`,
        [op.code, op.name.trim(), op.colour, op.trackBalance, op.halfDayAllowed, op.active]);
      await audit(session, r.rows[0].id, "Leave type added", op.name);
      return done({ id: r.rows[0].id });
    }
    case "rule.set": {
      const r = await query<{ id: string }>(
        `INSERT INTO leave_entitlement_rule (leavetypeid, minyears, days) VALUES ($1, $2, $3)
         ON CONFLICT (leavetypeid, minyears) DO UPDATE SET days = EXCLUDED.days RETURNING id`, [op.leaveTypeId, op.minYears, op.days]);
      await audit(session, r.rows[0].id, "Entitlement rule", `from ${op.minYears} years: ${op.days} days`);
      return done({ id: r.rows[0].id });
    }
    case "rule.delete": {
      await query(`DELETE FROM leave_entitlement_rule WHERE id = $1`, [op.id]);
      await audit(session, op.id, "Entitlement rule removed", op.id);
      return done({});
    }
    case "holiday.add": {
      const dup = await query(`SELECT 1 FROM public_holiday WHERE holidaydate = $1`, [op.date]);
      if (dup.rows.length > 0) return fail(409, "That date is already in the holiday list");
      const r = await query<{ id: string }>(`INSERT INTO public_holiday (holidaydate, name, createdby) VALUES ($1, $2, $3) RETURNING id`, [op.date, op.name.trim(), session.staffId]);
      await audit(session, r.rows[0].id, "Public holiday added", `${op.date} ${op.name}`);
      return done({ id: r.rows[0].id });
    }
    case "holiday.delete": {
      await query(`DELETE FROM public_holiday WHERE id = $1`, [op.id]);
      await audit(session, op.id, "Public holiday removed", op.id);
      return done({});
    }
    case "balance.save": {
      if (!(await inDept(op.staffId))) return fail(404, "Staff member not found");
      const t = await query(`SELECT 1 FROM leave_type WHERE id = $1`, [op.leaveTypeId]);
      if (t.rows.length === 0) return fail(404, "Leave type not found");
      await query(
        `INSERT INTO leave_balance (staffid, leavetypeid, year, entitled, carriedforward, adjustment, note) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (staffid, leavetypeid, year) DO UPDATE SET entitled = EXCLUDED.entitled, carriedforward = EXCLUDED.carriedforward,
           adjustment = EXCLUDED.adjustment, note = EXCLUDED.note, updatedat = now()`,
        [op.staffId, op.leaveTypeId, op.year, op.entitled, op.carriedForward, op.adjustment, op.note?.trim() || null]);
      await audit(session, op.staffId, "Leave balance", `${op.year}: ${op.entitled} + ${op.carriedForward} + ${op.adjustment}`);
      return done({});
    }
    case "balance.generate": {
      // Fills in missing rows only, from the entitlement rules and each person's join date; nothing already entered is overwritten.
      const people = (await query<{ id: string; joinDate: string | null }>(
        `SELECT id, to_char(joindate,'YYYY-MM-DD') AS "joinDate" FROM staff WHERE deptid = $1 AND status IN ('Active','OnLeave')`, [dept])).rows;
      const types = (await query<{ id: string }>(`SELECT id FROM leave_type WHERE trackbalance AND active`)).rows;
      const rules = (await query<{ leaveTypeId: string; minYears: number; days: number }>(
        `SELECT leavetypeid AS "leaveTypeId", minyears::float AS "minYears", days::float AS days FROM leave_entitlement_rule`)).rows;
      let created = 0;
      for (const p of people) {
        const years = yearsOfService(p.joinDate, `${op.year}-01-01`);
        for (const t of types) {
          const days = entitlementFor(years, rules.filter((r) => r.leaveTypeId === t.id)) ?? 0;
          const r = await query(
            `INSERT INTO leave_balance (staffid, leavetypeid, year, entitled) VALUES ($1, $2, $3, $4) ON CONFLICT (staffid, leavetypeid, year) DO NOTHING`,
            [p.id, t.id, op.year, days]);
          created += r.rowCount ?? 0;
        }
      }
      await audit(session, session.staffId, "Balances generated", `${op.year}: ${created} row(s)`);
      return done({ created });
    }
    case "joindate.set": {
      if (!(await inDept(op.staffId))) return fail(404, "Staff member not found");
      await query(`UPDATE staff SET joindate = $2 WHERE id = $1`, [op.staffId, op.joinDate]);
      await audit(session, op.staffId, "Join date", op.joinDate ?? "cleared");
      return done({});
    }
    case "approver.set": {
      if (op.staffId === null) {
        await query(`DELETE FROM leave_setting WHERE key = 'actingApprover'`);
        await audit(session, session.staffId, "Acting approver", "cleared");
        return done({});
      }
      if (!op.from || !op.to) return fail(400, "Give both a start and an end date");
      if (op.from > op.to) return fail(400, "The end date is before the start date");
      const sm = await query(`SELECT 1 FROM staff s JOIN role r ON r.id = s.roleid WHERE s.id = $1 AND s.deptid = $2 AND r.rolecode = 'SM' AND s.status = 'Active'`, [op.staffId, dept]);
      if (sm.rows.length === 0) return fail(400, "Choose an active Solution Manager in your department");
      await query(
        `INSERT INTO leave_setting (key, value, updatedby) VALUES ('actingApprover', $1::jsonb, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updatedby = EXCLUDED.updatedby, updatedat = now()`,
        [JSON.stringify({ staffId: op.staffId, from: op.from, to: op.to }), session.staffId]);
      await audit(session, op.staffId, "Acting approver", `${op.from} to ${op.to}`);
      return done({});
    }
  }
}
