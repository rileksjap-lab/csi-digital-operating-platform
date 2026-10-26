import pool, { query } from "@/lib/db/pool";
import { insertAuditEntry } from "@/lib/db/audit";

// Immediate-superior ("reports to") lines used by the KPI appraisal workflow.
// People are listed from the HOD's own department; a superior may also be the
// SVP, who sits above the department.

export interface ReportingRow {
  staffId: string;
  name: string;
  roleCode: string;
  roleName: string;
  subTeam: string | null;
  reportsTo: string | null;
}

export interface Superior {
  staffId: string;
  name: string;
  roleCode: string;
  roleName: string;
}

export async function listReportingLines(departmentId: string): Promise<{ staff: ReportingRow[]; superiors: Superior[] }> {
  const res = await query<ReportingRow & { isCandidate: boolean }>(
    `SELECT s.id AS "staffId", s.name, r.rolecode AS "roleCode", r.rolename AS "roleName",
            s.subteam AS "subTeam", s.reportsto AS "reportsTo",
            (s.deptid = $1 OR r.rolecode = 'SVP') AS "isCandidate"
     FROM staff s JOIN role r ON r.id = s.roleid
     WHERE s.status = 'Active' AND (s.deptid = $1 OR r.rolecode = 'SVP')
     ORDER BY r.rolename, s.name`,
    [departmentId]
  );
  const rows = res.rows;
  return {
    // The SVP is never given a superior here, so it is only a candidate.
    staff: rows.filter((r) => r.roleCode !== "SVP").map(({ isCandidate: _c, ...r }) => r),
    superiors: rows.map((r) => ({ staffId: r.staffId, name: r.name, roleCode: r.roleCode, roleName: r.roleName })),
  };
}

export type ReportingResult =
  | { ok: true; changed: number }
  | { ok: false; message: string };

export async function saveReportingLines(
  departmentId: string,
  changes: { staffId: string; reportsTo: string | null }[],
  performedBy: string
): Promise<ReportingResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Everyone who may appear in the chart, with their current superior.
    const cur = await client.query<{ id: string; name: string; reportsto: string | null; inDept: boolean; isSvp: boolean }>(
      `SELECT s.id, s.name, s.reportsto, (s.deptid = $1) AS "inDept", (r.rolecode = 'SVP') AS "isSvp"
       FROM staff s JOIN role r ON r.id = s.roleid
       WHERE s.status = 'Active' AND (s.deptid = $1 OR r.rolecode = 'SVP')`,
      [departmentId]
    );
    const people = new Map(cur.rows.map((p) => [p.id, p]));
    const next = new Map(cur.rows.map((p) => [p.id, p.reportsto]));

    const effective: typeof changes = [];
    for (const c of changes) {
      const person = people.get(c.staffId);
      if (!person || !person.inDept || person.isSvp) { await client.query("ROLLBACK"); return { ok: false, message: "One of the selected people is not an active member of your department" }; }
      if (c.reportsTo !== null) {
        if (c.reportsTo === c.staffId) { await client.query("ROLLBACK"); return { ok: false, message: `${person.name} cannot report to themselves` }; }
        if (!people.has(c.reportsTo)) { await client.query("ROLLBACK"); return { ok: false, message: "A selected superior is not an active staff member" }; }
      }
      if ((person.reportsto ?? null) === c.reportsTo) continue;
      next.set(c.staffId, c.reportsTo);
      effective.push(c);
    }

    // No loops: following the superiors upward from anyone must end.
    for (const c of effective) {
      const seen = new Set<string>([c.staffId]);
      let at = next.get(c.staffId) ?? null;
      while (at) {
        if (seen.has(at)) {
          await client.query("ROLLBACK");
          return { ok: false, message: `That would make a loop: ${people.get(c.staffId)?.name} would end up reporting to themselves through the chain` };
        }
        seen.add(at);
        at = next.get(at) ?? null;
      }
    }

    for (const c of effective) {
      await client.query(`UPDATE staff SET reportsto = $2, updatedat = now() WHERE id = $1`, [c.staffId, c.reportsTo]);
      const before = people.get(c.staffId)!.reportsto;
      await insertAuditEntry(
        {
          entityName: "STAFF", entityId: c.staffId, action: "Update", fieldName: "Reports to",
          oldValue: before ? people.get(before)?.name ?? before : null,
          newValue: c.reportsTo ? people.get(c.reportsTo)?.name ?? c.reportsTo : null,
          performedBy,
        },
        client
      );
    }

    await client.query("COMMIT");
    return { ok: true, changed: effective.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
