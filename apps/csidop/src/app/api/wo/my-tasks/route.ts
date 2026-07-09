import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

interface MyTaskRow {
  id: string;
  csiWoNo: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  effortHours: number;
  createdAt: string;
  updatedAt: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const status = request.nextUrl.searchParams.get("status") ?? undefined;

    const params: unknown[] = [session.staffId];
    const conditions = ["w.assignedto = $1"];

    if (status) {
      params.push(status);
      conditions.push(`w.status = $${params.length}`);
    }

    const { rows } = await query<MyTaskRow>(
      `SELECT w.id AS "id",
              w.csi_wo_no AS "csiWoNo",
              w.title AS "title",
              w.status AS "status",
              w.priorityinterdepart AS "priority",
              w.duedate::text AS "dueDate",
              COALESCE((SELECT SUM(el.hours) FROM effort_log el WHERE el.csi_wo_id = w.id), 0)::float AS "effortHours",
              w.createdat AS "createdAt",
              w.updatedat AS "updatedAt"
       FROM csi_wo w
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE w.status
           WHEN 'Open' THEN 1
           WHEN 'InProgress' THEN 2
           WHEN 'PendingApproval' THEN 3
           ELSE 4
         END,
         w.duedate ASC NULLS LAST`,
      params
    );

    // Compute summary counts from unfiltered query
    const { rows: summaryRows } = await query<{ status: string; count: string }>(
      `SELECT w.status AS "status", COUNT(*)::int AS "count"
       FROM csi_wo w WHERE w.assignedto = $1 GROUP BY w.status`,
      [session.staffId]
    );

    const statusCounts: Record<string, number> = {};
    for (const r of summaryRows) statusCounts[r.status] = parseInt(r.count, 10);

    const { rows: dueRows } = await query<{ count: string }>(
      `SELECT COUNT(*)::int AS "count"
       FROM csi_wo w
       WHERE w.assignedto = $1
         AND w.status IN ('Open', 'InProgress')
         AND w.duedate BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
      [session.staffId]
    );

    return ok({
      tasks: rows,
      summary: {
        open: statusCounts["Open"] ?? 0,
        inProgress: statusCounts["InProgress"] ?? 0,
        pendingApproval: statusCounts["PendingApproval"] ?? 0,
        dueThisWeek: parseInt(dueRows[0]?.count ?? "0", 10),
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[wo/my-tasks] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
