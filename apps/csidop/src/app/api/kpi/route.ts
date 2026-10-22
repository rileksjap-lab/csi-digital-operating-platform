import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import type { ScopeFilter } from "@/lib/auth/guards";
import { ok, badRequest, unauthorized, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";
import { getCurrentPeriod, PERIOD_PATTERN } from "@/lib/kpi/metrics";
import { recomputePeriod, refreshIfStale } from "@/lib/kpi/compute";

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

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? getCurrentPeriod();
    if (!PERIOD_PATTERN.test(period)) return badRequest("period must look like 2026-Q4");

    // Keep the numbers fresh without needing a scheduled job: recalculate when
    // anything for this period is older than 10 minutes. A failure here must
    // not take the dashboard down, so fall back to whatever is stored.
    try {
      await refreshIfStale(period);
    } catch (err) {
      console.error("[kpi] refresh failed, serving stored values", err);
    }

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
                COUNT(*) FILTER (WHERE k.achievedvalue IS NULL)::int AS "noDataCount",
                COALESCE(AVG(k.targetvalue) FILTER (WHERE k.achievedvalue IS NOT NULL), 0) AS "avgTarget",
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

    interface StaffMetric {
      metricName: string;
      target: number;
      achieved: number | null;
      met: boolean;
    }

    interface StaffKpi {
      staffId: string;
      staffName: string;
      subTeam: string | null;
      roleCode: string;
      metrics: StaffMetric[];
      oi: { registered: number; won: number } | null;
      overallPct: number;
    }

    const staffMap = new Map<string, StaffKpi>();
    const ensureStaff = (r: Record<string, unknown>, staffId: string) => {
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
      return staffMap.get(staffId)!;
    };

    for (const r of kpiRes.rows) {
      const target = parseFloat(String(r.targetvalue ?? 0));
      const achieved = r.achievedvalue == null ? null : parseFloat(String(r.achievedvalue));
      ensureStaff(r, r.staffid as string).metrics.push({
        metricName: r.metricname as string,
        target,
        achieved,
        met: achieved !== null && achieved >= target,
      });
    }

    for (const r of oiRes.rows) {
      ensureStaff(r, r.staffid as string).oi = {
        registered: Number(r.registered),
        won: Number(r.won),
      };
    }

    // Overall % per person = average of how close each measured metric is to
    // its target (capped at 150% so one outlier can't mask misses). Metrics
    // with no data yet are left out rather than counted as 0.
    for (const entry of staffMap.values()) {
      const measured = entry.metrics.filter((m) => m.achieved !== null);
      if (measured.length > 0) {
        const pcts = measured.map((m) =>
          m.target > 0 ? Math.min(((m.achieved as number) / m.target) * 100, 150) : 100
        );
        entry.overallPct = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length);
      }
    }

    const staffKpis = Array.from(staffMap.values()).sort((a, b) => b.overallPct - a.overallPct);

    const metricSummaries = metricSummaryRes.rows.map((r) => ({
      metricName: r.metricname as string,
      staffCount: Number(r.staffCount),
      noDataCount: Number(r.noDataCount),
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

// Manual / scheduled recalculation. The dashboard also refreshes itself on
// read, so a scheduler is optional. Protected by CRON_SECRET when it is set.
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return unauthorized();
    }

    const body = await request.json().catch(() => ({}));
    const period: string = typeof body.period === "string" ? body.period : getCurrentPeriod();
    if (!PERIOD_PATTERN.test(period)) return badRequest("period must look like 2026-Q4");

    const { updated, failed } = await recomputePeriod(period);
    return ok({ period, updated, failed });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
