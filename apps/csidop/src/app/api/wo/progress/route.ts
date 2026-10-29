import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { buildScopeWhere } from "@/lib/auth/wo-scope";
import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const { clause: scopeClause, params: scopeParams } = buildScopeWhere(scope, 1);

    const [overviewRes, overdueRes, byAssigneeRes, byPriorityRes, slaRes, recentActivityRes, byTypeRes] =
      await Promise.all([
        query(
          `SELECT
             COUNT(*)::int AS "total",
             COUNT(*) FILTER (WHERE w.status = 'Open')::int AS "open",
             COUNT(*) FILTER (WHERE w.status = 'InProgress')::int AS "inProgress",
             COUNT(*) FILTER (WHERE w.status = 'PendingApproval')::int AS "pendingApproval",
             COUNT(*) FILTER (WHERE w.status = 'Closed')::int AS "closed",
             COUNT(*) FILTER (WHERE w.status = 'OnHold')::int AS "onHold",
             COUNT(*) FILTER (WHERE w.status IN ('Open','InProgress') AND w.duedate < CURRENT_DATE)::int AS "overdue",
             COALESCE(ROUND(AVG(
               CASE WHEN w.status = 'Closed'
                 THEN EXTRACT(EPOCH FROM (w.updatedat - w.createdat)) / 86400
               END
             )::numeric, 1), 0) AS "avgResolutionDays",
             COALESCE(ROUND(
               100.0 * COUNT(*) FILTER (WHERE w.status = 'Closed' AND (w.duedate IS NULL OR w.updatedat::date <= w.duedate))
               / NULLIF(COUNT(*) FILTER (WHERE w.status = 'Closed'), 0)
             , 1), 0) AS "slaCompliancePct"
           FROM csi_wo w
           WHERE 1=1 ${scopeClause}`,
          scopeParams
        ),

        query(
          `SELECT w.id, w.csi_wo_no AS "csiWoNo", w.title, w.priorityinterdepart AS "priority", w.status,
                  w.duedate AS "dueDate", w.createdat AS "createdAt",
                  s.name AS "assignedToName",
                  (CURRENT_DATE - w.duedate)::int AS "daysOverdue"
           FROM csi_wo w
           LEFT JOIN staff s ON s.id = w.assignedto
           WHERE w.status IN ('Open','InProgress')
             AND w.duedate < CURRENT_DATE
             ${scopeClause}
           ORDER BY w.duedate ASC
           LIMIT 20`,
          scopeParams
        ),

        query(
          `SELECT s.id AS "staffId", s.name AS "staffName", s.subteam AS "subTeam",
                  COUNT(*)::int AS "total",
                  COUNT(*) FILTER (WHERE w.status = 'Open')::int AS "open",
                  COUNT(*) FILTER (WHERE w.status = 'InProgress')::int AS "inProgress",
                  COUNT(*) FILTER (WHERE w.status = 'Closed')::int AS "closed",
                  COUNT(*) FILTER (WHERE w.status IN ('Open','InProgress') AND w.duedate < CURRENT_DATE)::int AS "overdue",
                  COALESCE(SUM(el.hours), 0)::float AS "effortHours"
           FROM csi_wo w
           JOIN staff s ON s.id = w.assignedto
           LEFT JOIN LATERAL (
             SELECT SUM(e.hours) AS hours FROM effort_log e WHERE e.csi_wo_id = w.id
           ) el ON true
           WHERE w.assignedto IS NOT NULL
             ${scopeClause}
           GROUP BY s.id, s.name, s.subteam
           ORDER BY "overdue" DESC, "total" DESC`,
          scopeParams
        ),

        query(
          `SELECT w.priorityinterdepart AS "priority",
                  COUNT(*)::int AS "total",
                  COUNT(*) FILTER (WHERE w.status IN ('Open','InProgress'))::int AS "active",
                  COUNT(*) FILTER (WHERE w.status = 'Closed')::int AS "closed",
                  COUNT(*) FILTER (WHERE w.status IN ('Open','InProgress') AND w.duedate < CURRENT_DATE)::int AS "overdue"
           FROM csi_wo w
           WHERE 1=1 ${scopeClause}
           GROUP BY w.priorityinterdepart
           ORDER BY CASE w.priorityinterdepart
             WHEN 'Critical' THEN 1 WHEN 'High' THEN 2
             WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 ELSE 5
           END`,
          scopeParams
        ),

        query(
          `SELECT
             CASE
               WHEN w.duedate IS NULL THEN 'No Due Date'
               WHEN w.duedate < CURRENT_DATE THEN 'Overdue'
               WHEN w.duedate < CURRENT_DATE + INTERVAL '3 days' THEN 'Due Soon (3d)'
               WHEN w.duedate < CURRENT_DATE + INTERVAL '7 days' THEN 'Due This Week'
               ELSE 'On Track'
             END AS "slaBand",
             COUNT(*)::int AS "count"
           FROM csi_wo w
           WHERE w.status IN ('Open','InProgress')
             ${scopeClause}
           GROUP BY 1
           ORDER BY CASE
             WHEN w.duedate IS NULL THEN 5
             WHEN w.duedate < CURRENT_DATE THEN 1
             WHEN w.duedate < CURRENT_DATE + INTERVAL '3 days' THEN 2
             WHEN w.duedate < CURRENT_DATE + INTERVAL '7 days' THEN 3
             ELSE 4
           END`,
          scopeParams
        ).catch(() => ({ rows: [] })),

        query(
          `SELECT w.id, w.csi_wo_no AS "csiWoNo", w.title, w.status, w.priorityinterdepart AS "priority",
                  w.updatedat AS "updatedAt",
                  s.name AS "assignedToName"
           FROM csi_wo w
           LEFT JOIN staff s ON s.id = w.assignedto
           WHERE 1=1 ${scopeClause}
           ORDER BY w.updatedat DESC NULLS LAST
           LIMIT 15`,
          scopeParams
        ),

        // Active work (open + in progress) per person and request type.
        query(
          `SELECT s.id AS "staffId", s.name AS "staffName", s.subteam AS "subTeam",
                  rt.id AS "typeId", rt.typename AS "typeName",
                  COUNT(*)::int AS "active",
                  COUNT(*) FILTER (WHERE w.duedate < CURRENT_DATE)::int AS "overdue"
           FROM csi_wo w
           JOIN staff s ON s.id = w.assignedto
           JOIN request_type rt ON rt.id = w.requesttypeid
           WHERE w.status IN ('Open','InProgress')
             ${scopeClause}
           GROUP BY s.id, s.name, s.subteam, rt.id, rt.typename`,
          scopeParams
        ),
      ]);

    // Pivot into one row per person, one column per request type that has any active work.
    const types = new Map<string, { id: string; name: string; active: number; overdue: number }>();
    const people = new Map<string, {
      staffId: string; staffName: string; subTeam: string | null; active: number; overdue: number;
      cells: Record<string, { active: number; overdue: number }>;
    }>();
    for (const r of byTypeRes.rows as {
      staffId: string; staffName: string; subTeam: string | null; typeId: string; typeName: string; active: number; overdue: number;
    }[]) {
      const a = Number(r.active), o = Number(r.overdue);
      const t = types.get(r.typeId) ?? { id: r.typeId, name: r.typeName, active: 0, overdue: 0 };
      t.active += a; t.overdue += o; types.set(r.typeId, t);
      const p = people.get(r.staffId) ?? { staffId: r.staffId, staffName: r.staffName, subTeam: r.subTeam ?? null, active: 0, overdue: 0, cells: {} };
      p.active += a; p.overdue += o; p.cells[r.typeId] = { active: a, overdue: o }; people.set(r.staffId, p);
    }

    const overview = overviewRes.rows[0];

    return ok({
      overview: {
        total: Number(overview.total),
        open: Number(overview.open),
        inProgress: Number(overview.inProgress),
        pendingApproval: Number(overview.pendingApproval),
        closed: Number(overview.closed),
        onHold: Number(overview.onHold),
        overdue: Number(overview.overdue),
        avgResolutionDays: Number(overview.avgResolutionDays),
        slaCompliancePct: Number(overview.slaCompliancePct),
      },
      overdueItems: overdueRes.rows.map((r) => ({
        id: r.id,
        csiWoNo: r.csiWoNo,
        title: r.title,
        priority: r.priority,
        status: r.status,
        dueDate: r.dueDate ? String(r.dueDate) : null,
        assignedToName: r.assignedToName ?? null,
        daysOverdue: Number(r.daysOverdue),
      })),
      byAssignee: byAssigneeRes.rows.map((r) => ({
        staffId: r.staffId,
        staffName: r.staffName,
        subTeam: r.subTeam,
        total: Number(r.total),
        open: Number(r.open),
        inProgress: Number(r.inProgress),
        closed: Number(r.closed),
        overdue: Number(r.overdue),
        effortHours: Number(r.effortHours),
      })),
      byPriority: byPriorityRes.rows.map((r) => ({
        priority: r.priority,
        total: Number(r.total),
        active: Number(r.active),
        closed: Number(r.closed),
        overdue: Number(r.overdue),
      })),
      byAssigneeType: {
        types: [...types.values()].sort((x, y) => y.active - x.active || x.name.localeCompare(y.name)),
        rows: [...people.values()].sort((x, y) => y.active - x.active || x.staffName.localeCompare(y.staffName)),
      },
      slaBands: slaRes.rows.map((r) => ({
        band: r.slaBand,
        count: Number(r.count),
      })),
      recentActivity: recentActivityRes.rows.map((r) => ({
        id: r.id,
        csiWoNo: r.csiWoNo,
        title: r.title,
        status: r.status,
        priority: r.priority,
        updatedAt: r.updatedAt ? String(r.updatedAt) : null,
        assignedToName: r.assignedToName ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[wo/progress] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
