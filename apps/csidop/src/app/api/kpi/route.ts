import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import type { ScopeFilter } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

const COMPUTABLE_METRICS = [
  "SLA Compliance %",
  "Team Utilisation %",
  "WO Completion Rate %",
  "Billable Hours",
] as const;

function periodToDateRange(period: string): { start: string; end: string } {
  const match = period.match(/^(\d{4})-Q([1-4])$/);
  if (!match) throw new Error(`Invalid period format: ${period}`);
  const year = parseInt(match[1], 10);
  const q = parseInt(match[2], 10);
  const startMonth = (q - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function buildScopeWhere(scope: ScopeFilter, staffAlias: string, paramOffset: number): { clause: string; params: unknown[] } {
  switch (scope.scope) {
    case "Self":
      return {
        clause: `AND ${staffAlias}.id = $${paramOffset}`,
        params: [scope.staffId],
      };
    case "Pod":
      return {
        clause: `AND ${staffAlias}.deptid = $${paramOffset} AND ${staffAlias}.subteam = $${paramOffset + 1}`,
        params: [scope.departmentId, scope.subTeam],
      };
    default:
      return { clause: "", params: [] };
  }
}

function getCurrentPeriod(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? getCurrentPeriod();

    const { clause: scopeClause, params: scopeParams } = buildScopeWhere(scope, "s", 2);

    const [kpiRes, oiRes, metricSummaryRes] = await Promise.all([
      query(
        `SELECT k.metricname, k.staffid,
                s.name AS "staffName", s.subteam AS "subTeam",
                r.rolecode AS "roleCode",
                k.targetvalue, k.achievedvalue, k.calculatedat
         FROM kpi_record k
         JOIN staff s ON s.id = k.staffid
         JOIN role r ON r.id = k.roleid
         WHERE k.period = $1 ${scopeClause}
         ORDER BY s.name, k.metricname`,
        [period, ...scopeParams]
      ),

      query(
        `SELECT o.staffid, s.name AS "staffName", s.subteam AS "subTeam",
                r.rolecode AS "roleCode",
                o.registered, o.won
         FROM oi_tracker o
         JOIN staff s ON s.id = o.staffid
         JOIN role r ON r.id = s.roleid
         WHERE o.period = $1 ${scopeClause}
         ORDER BY s.name`,
        [period, ...scopeParams]
      ),

      query(
        `SELECT k.metricname,
                COUNT(*)::int AS "staffCount",
                COALESCE(AVG(k.targetvalue), 0) AS "avgTarget",
                COALESCE(AVG(k.achievedvalue), 0) AS "avgAchieved",
                COUNT(*) FILTER (WHERE k.achievedvalue >= k.targetvalue)::int AS "metCount",
                COUNT(*) FILTER (WHERE k.achievedvalue < k.targetvalue)::int AS "unmetCount"
         FROM kpi_record k
         JOIN staff s ON s.id = k.staffid
         WHERE k.period = $1 ${scopeClause}
         GROUP BY k.metricname
         ORDER BY k.metricname`,
        [period, ...scopeParams]
      ),
    ]);

    interface StaffKpi {
      staffId: string;
      staffName: string;
      subTeam: string | null;
      roleCode: string;
      metrics: { metricName: string; target: number; achieved: number; met: boolean }[];
      oi: { registered: number; won: number } | null;
      overallPct: number;
    }

    const staffMap = new Map<string, StaffKpi>();

    for (const r of kpiRes.rows) {
      const staffId = r.staffid as string;
      if (!staffMap.has(staffId)) {
        staffMap.set(staffId, {
          staffId,
          staffName: r.staffName as string,
          subTeam: (r.subTeam as string) ?? null,
          roleCode: r.roleCode as string,
          metrics: [],
          oi: null,
          overallPct: 0,
        });
      }
      staffMap.get(staffId)!.metrics.push({
        metricName: r.metricname as string,
        target: parseFloat(String(r.targetvalue ?? 0)),
        achieved: parseFloat(String(r.achievedvalue ?? 0)),
        met: parseFloat(String(r.achievedvalue ?? 0)) >= parseFloat(String(r.targetvalue ?? 0)),
      });
    }

    for (const r of oiRes.rows) {
      const staffId = r.staffid as string;
      if (!staffMap.has(staffId)) {
        staffMap.set(staffId, {
          staffId,
          staffName: r.staffName as string,
          subTeam: (r.subTeam as string) ?? null,
          roleCode: r.roleCode as string,
          metrics: [],
          oi: null,
          overallPct: 0,
        });
      }
      staffMap.get(staffId)!.oi = {
        registered: Number(r.registered),
        won: Number(r.won),
      };
    }

    for (const entry of staffMap.values()) {
      if (entry.metrics.length > 0) {
        const pcts = entry.metrics.map((m) =>
          m.target > 0 ? Math.min((m.achieved / m.target) * 100, 150) : 100
        );
        entry.overallPct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      }
    }

    const staffKpis = Array.from(staffMap.values()).sort((a, b) => b.overallPct - a.overallPct);

    const metricSummaries = metricSummaryRes.rows.map((r) => ({
      metricName: r.metricname as string,
      staffCount: Number(r.staffCount),
      avgTarget: parseFloat(String(r.avgTarget)),
      avgAchieved: parseFloat(String(r.avgAchieved)),
      metCount: Number(r.metCount),
      unmetCount: Number(r.unmetCount),
      achievementPct: parseFloat(String(r.avgTarget)) > 0
        ? Math.round((parseFloat(String(r.avgAchieved)) / parseFloat(String(r.avgTarget))) * 100)
        : 0,
    }));

    const totalMetrics = metricSummaries.reduce((s, m) => s + m.metCount + m.unmetCount, 0);
    const totalMet = metricSummaries.reduce((s, m) => s + m.metCount, 0);
    const overallAchievement = totalMetrics > 0 ? Math.round((totalMet / totalMetrics) * 100) : 0;

    return ok({
      period,
      overallAchievement,
      totalStaff: staffMap.size,
      totalMetrics,
      totalMet,
      metricSummaries,
      staffKpis,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return badRequest("Unauthorized");
    }

    const body = await request.json().catch(() => ({}));
    const period: string = typeof body.period === "string" ? body.period : getCurrentPeriod();
    const { start, end } = periodToDateRange(period);

    const targets = await query<{ staffid: string; metricname: string }>(
      `SELECT DISTINCT staffid, metricname FROM kpi_record
       WHERE period = $1 AND metricname = ANY($2::text[])`,
      [period, COMPUTABLE_METRICS]
    );

    let updated = 0;

    for (const row of targets.rows) {
      const { staffid, metricname } = row;
      let achieved: number | null = null;

      switch (metricname) {
        case "SLA Compliance %": {
          const r = await query<{ total: string; ontime: string }>(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE duedate IS NULL OR updatedat::date <= duedate)::int AS ontime
             FROM csi_wo
             WHERE assignedto = $1 AND status = 'Closed'
               AND updatedat >= $2 AND updatedat < ($3::date + INTERVAL '1 day')`,
            [staffid, start, end]
          );
          const total = Number(r.rows[0]?.total ?? 0);
          const ontime = Number(r.rows[0]?.ontime ?? 0);
          achieved = total > 0 ? (ontime / total) * 100 : 0;
          break;
        }
        case "Team Utilisation %": {
          const r = await query<{ assigned: string; capacity: string }>(
            `SELECT COALESCE(SUM(a.assignedhours), 0)::float AS assigned,
                    COALESCE(s.productivityfactor, 1.0) * 8 * 22 AS capacity
             FROM staff s
             LEFT JOIN assignment a ON a.staffid = s.id
               AND a.assigneddate >= $2 AND a.assigneddate <= $3
             WHERE s.id = $1
             GROUP BY s.productivityfactor`,
            [staffid, start, end]
          );
          const assigned = Number(r.rows[0]?.assigned ?? 0);
          const capacity = Number(r.rows[0]?.capacity ?? 0);
          achieved = capacity > 0 ? (assigned / capacity) * 100 : 0;
          break;
        }
        case "WO Completion Rate %": {
          const r = await query<{ total: string; closed: string }>(
            `SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE status = 'Closed')::int AS closed
             FROM csi_wo
             WHERE assignedto = $1
               AND createdat >= $2 AND createdat < ($3::date + INTERVAL '1 day')`,
            [staffid, start, end]
          );
          const total = Number(r.rows[0]?.total ?? 0);
          const closed = Number(r.rows[0]?.closed ?? 0);
          achieved = total > 0 ? (closed / total) * 100 : 0;
          break;
        }
        case "Billable Hours": {
          const r = await query<{ hours: string }>(
            `SELECT COALESCE(SUM(hours), 0)::float AS hours
             FROM effort_log
             WHERE staffid = $1 AND logdate >= $2 AND logdate <= $3`,
            [staffid, start, end]
          );
          achieved = Number(r.rows[0]?.hours ?? 0);
          break;
        }
      }

      if (achieved !== null) {
        await query(
          `UPDATE kpi_record SET achievedvalue = $1, calculatedat = now(), updatedat = now()
           WHERE staffid = $2 AND period = $3 AND metricname = $4`,
          [achieved, staffid, period, metricname]
        );
        updated++;
      }
    }

    return ok({ period, updated });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
