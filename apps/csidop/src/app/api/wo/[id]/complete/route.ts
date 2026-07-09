import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, badRequest, zodError, internalError } from "@/lib/response";
import { completeWorkOrder, getWorkOrderById } from "@/lib/repositories/wo.repo";
import { woCompleteSchema } from "@/lib/validations/wo.schema";
import { createNotification } from "@/lib/repositories/notification.repo";
import { query } from "@/lib/db/pool";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = woCompleteSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const { result, error } = await completeWorkOrder(
      id,
      parsed.data.completionNote,
      session,
      scope
    );

    if (error === "INVALID_STATUS_TRANSITION") {
      return badRequest("WO must be in Open or InProgress status to complete");
    }
    if (!result) return notFound("Work order not found");

    // Send in-app notification to approvers
    if (result.approverRole) {
      const wo = await getWorkOrderById(id, scope);
      const roleCodeMap: Record<string, string> = {
        TeamLead: "TL",
        SolutionManager: "SM",
        HOD: "HOD",
      };
      const roleCode = roleCodeMap[result.approverRole] ?? "HOD";
      const approvers = await query<{ id: string }>(
        `SELECT s.id FROM staff s
         JOIN role r ON r.id = s.roleid
         JOIN department d ON d.id = s.deptid
         WHERE r.rolecode = $1 AND d.deptcode = 'CSI' AND s.status = 'Active'`,
        [roleCode]
      );
      for (const approver of approvers.rows) {
        createNotification({
          staffId: approver.id,
          title: "Work order pending approval",
          body: wo ? `${wo.csiWoNo} — ${wo.title}` : undefined,
          category: "Approval",
          linkUrl: `/wo/${id}`,
        }).catch((e) => console.error("[notification] create failed", e));
      }
    }

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/:id/complete] POST error", err);
    return internalError(reqId);
  }
}
