import type { NextRequest } from "next/server";
import { z } from "zod";
import pool, { query } from "@/lib/db/pool";
import { requireKpiAuth, requireRole } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { insertAuditEntry } from "@/lib/db/audit";
import { KPI_METRICS, KPI_METRIC_NAMES, PERIOD_PATTERN, getCurrentPeriod } from "@/lib/kpi/metrics";
import { recomputePeriod } from "@/lib/kpi/compute";

// Only the HOD sets KPI targets, per person per quarter, for their own
// department. Achieved values are calculated by the system, never typed in.

export async function GET(request: NextRequest) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD");

    const period = new URL(request.url).searchParams.get("period") ?? getCurrentPeriod();
    if (!PERIOD_PATTERN.test(period)) return badRequest("period must look like 2026-Q4");

    const [staffRes, targetRes] = await Promise.all([
      query(
        `SELECT s.id AS "staffId", s.name, r.rolecode AS "roleCode", s.subteam AS "subTeam"
         FROM staff s
         JOIN role r ON r.id = s.roleid
         WHERE s.status = 'Active' AND s.deptid = $1
         ORDER BY s.name`,
        [session.departmentId]
      ),
      query(
        `SELECT k.staffid AS "staffId", k.metricname AS "metricName", k.targetvalue AS "targetValue"
         FROM kpi_record k
         JOIN staff s ON s.id = k.staffid
         WHERE k.period = $1 AND s.deptid = $2 AND k.metricname = ANY($3::text[])`,
        [period, session.departmentId, KPI_METRIC_NAMES]
      ),
    ]);

    const targets = new Map<string, Record<string, number>>();
    for (const t of targetRes.rows) {
      const entry = targets.get(t.staffId as string) ?? {};
      if (t.targetValue != null) entry[t.metricName as string] = parseFloat(String(t.targetValue));
      targets.set(t.staffId as string, entry);
    }

    return ok({
      period,
      metrics: KPI_METRICS,
      staff: staffRes.rows.map((s) => ({
        staffId: s.staffId as string,
        name: s.name as string,
        roleCode: s.roleCode as string,
        subTeam: (s.subTeam as string) ?? null,
        targets: targets.get(s.staffId as string) ?? {},
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/targets] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

const saveSchema = z.object({
  period: z.string().regex(PERIOD_PATTERN),
  targets: z
    .array(
      z.object({
        staffId: z.string().uuid(),
        metricName: z.string().refine((m) => KPI_METRIC_NAMES.includes(m), "Unknown KPI metric"),
        // null clears the target (the person is no longer measured on it)
        targetValue: z.number().min(0).max(100).nullable(),
      })
    )
    .max(2000),
});

export async function PUT(request: NextRequest) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD");

    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const { period, targets } = parsed.data;

    const client = await pool.connect();
    let changed = 0;
    try {
      await client.query("BEGIN");

      // Existing targets in this department for the period, to find real changes.
      const existing = await client.query<{ id: string; staffid: string; metricname: string; targetvalue: string | null }>(
        `SELECT k.id, k.staffid, k.metricname, k.targetvalue
         FROM kpi_record k JOIN staff s ON s.id = k.staffid
         WHERE k.period = $1 AND s.deptid = $2 AND k.metricname = ANY($3::text[])`,
        [period, session.departmentId, KPI_METRIC_NAMES]
      );
      const byKey = new Map(existing.rows.map((r) => [`${r.staffid}|${r.metricname}`, r]));

      for (const t of targets) {
        const old = byKey.get(`${t.staffId}|${t.metricName}`);
        const oldValue = old?.targetvalue == null ? null : parseFloat(old.targetvalue);

        if (t.targetValue === null) {
          if (!old) continue;
          await client.query(`DELETE FROM kpi_record WHERE id = $1`, [old.id]);
          await insertAuditEntry(
            { entityName: "KPI_RECORD", entityId: old.id, action: "Delete", fieldName: `Target: ${t.metricName} ${period}`,
              oldValue: String(oldValue), performedBy: session.staffId },
            client
          );
          changed++;
          continue;
        }

        if (old && oldValue === t.targetValue) continue;

        const upsert = await client.query<{ id: string }>(
          `INSERT INTO kpi_record (staffid, roleid, period, metricname, targetvalue)
           SELECT s.id, s.roleid, $3, $4, $5
           FROM staff s
           WHERE s.id = $1 AND s.status = 'Active' AND s.deptid = $2
           ON CONFLICT (staffid, period, metricname)
           DO UPDATE SET targetvalue = EXCLUDED.targetvalue, updatedat = now()
           RETURNING id`,
          [t.staffId, session.departmentId, period, t.metricName, t.targetValue]
        );
        if (upsert.rows.length === 0) {
          await client.query("ROLLBACK");
          return badRequest("One of the selected staff members is not an active member of your department");
        }
        await insertAuditEntry(
          { entityName: "KPI_RECORD", entityId: upsert.rows[0].id, action: old ? "Update" : "Insert",
            fieldName: `Target: ${t.metricName} ${period}`,
            oldValue: old ? String(oldValue) : null, newValue: String(t.targetValue), performedBy: session.staffId },
          client
        );
        changed++;
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Fill in achieved values straight away so the dashboard isn't empty. The
    // targets are already saved, so a calculation problem must not fail the save.
    let failed: string[] = [];
    if (changed > 0) failed = (await recomputePeriod(period)).failed;
    return ok({ period, changed, failed });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/targets] PUT error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
