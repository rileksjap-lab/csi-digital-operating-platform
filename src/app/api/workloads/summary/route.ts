import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";

interface DomainSummary {
  domain: string;
  totalWOs: number;
  open: number;
  inProgress: number;
  pendingApproval: number;
  closed: number;
  totalEffortHours: number;
  avgCompletionDays: number | null;
  overdueCount: number;
}

interface WorkloadsSummaryResponse {
  overall: {
    totalWOs: number;
    open: number;
    inProgress: number;
    closed: number;
    totalEffortHours: number;
    overdueCount: number;
  };
  byDomain: DomainSummary[];
}

function buildScopeWhere(scope: ScopeFilter, paramOffset: number): { clause: string; params: unknown[] } {
  switch (scope.scope) {
    case "Self":
      return {
        clause: `AND (w.assignedto = $${paramOffset} OR w.createdby = $${paramOffset})`,
        params: [scope.staffId],
      };
    case "Pod":
      return {
        clause: `AND (w.assignedto IN (SELECT s2.id FROM staff s2 WHERE s2.deptid = $${paramOffset} AND s2.subteam = $${paramOffset + 1}) OR w.createdby = $${paramOffset + 2})`,
        params: [scope.departmentId, scope.subTeam, scope.staffId],
      };
    default:
      return { clause: "", params: [] };
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const { clause: scopeClause, params: scopeParams } = buildScopeWhere(scope, 1);

    const { rows: domainRows } = await query<{
      domain: string;
      totalWOs: string;
      open: string;
      inProgress: string;
      pendingApproval: string;
      closed: string;
      totalEffortHours: string;
      avgCompletionDays: string | null;
      overdueCount: string;
    }>(
      `SELECT
         rt.domain                                                       AS "domain",
         COUNT(*)::int                                                   AS "totalWOs",
         COUNT(*) FILTER (WHERE w.status = 'Open')::int                  AS "open",
         COUNT(*) FILTER (WHERE w.status = 'InProgress')::int            AS "inProgress",
         COUNT(*) FILTER (WHERE w.status = 'PendingApproval')::int       AS "pendingApproval",
         COUNT(*) FILTER (WHERE w.status = 'Closed')::int                AS "closed",
         COALESCE(SUM(el.hours), 0)::float                              AS "totalEffortHours",
         ROUND(AVG(
           CASE WHEN w.status = 'Closed'
             THEN EXTRACT(EPOCH FROM (w.updatedat - w.createdat)) / 86400
           END
         )::numeric, 1)                                                  AS "avgCompletionDays",
         COUNT(*) FILTER (
           WHERE w.status IN ('Open','InProgress')
             AND w.duedate < CURRENT_DATE
         )::int                                                          AS "overdueCount"
       FROM csi_wo w
       JOIN request_type rt ON rt.id = w.requesttypeid
       LEFT JOIN LATERAL (
         SELECT SUM(e.hours) AS hours FROM effort_log e WHERE e.csi_wo_id = w.id
       ) el ON true
       WHERE 1=1 ${scopeClause}
       GROUP BY rt.domain
       ORDER BY rt.domain`,
      scopeParams
    );

    const overall = {
      totalWOs: 0,
      open: 0,
      inProgress: 0,
      closed: 0,
      totalEffortHours: 0,
      overdueCount: 0,
    };

    const byDomain: DomainSummary[] = domainRows.map((r) => {
      const d: DomainSummary = {
        domain: r.domain,
        totalWOs: Number(r.totalWOs),
        open: Number(r.open),
        inProgress: Number(r.inProgress),
        pendingApproval: Number(r.pendingApproval),
        closed: Number(r.closed),
        totalEffortHours: Number(r.totalEffortHours),
        avgCompletionDays: r.avgCompletionDays != null ? Number(r.avgCompletionDays) : null,
        overdueCount: Number(r.overdueCount),
      };
      overall.totalWOs += d.totalWOs;
      overall.open += d.open;
      overall.inProgress += d.inProgress;
      overall.closed += d.closed;
      overall.totalEffortHours += d.totalEffortHours;
      overall.overdueCount += d.overdueCount;
      return d;
    });

    const result: WorkloadsSummaryResponse = { overall, byDomain };
    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[workloads/summary] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
