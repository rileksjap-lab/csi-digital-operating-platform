import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import type { ScopeFilter } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

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

export async function POST() {
  return new Response(JSON.stringify({ success: false, error: { message: "KPI calculation requires the FastAPI compute worker" } }), {
    status: 501,
    headers: { "Content-Type": "application/json" },
  });
}
