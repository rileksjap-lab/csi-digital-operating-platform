import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, badRequest, zodError, internalError } from "@/lib/response";
import { approveWorkOrder, getWorkOrderById } from "@/lib/repositories/wo.repo";
import { woApproveSchema } from "@/lib/validations/wo.schema";
import { createNotification } from "@/lib/repositories/notification.repo";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id } = await params;
    const body = await request.json();
    const parsed = woApproveSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const { result, error } = await approveWorkOrder(id, parsed.data, session, scope);

    if (error === "INVALID_STATUS_TRANSITION") {
      return badRequest("WO must be in PendingApproval status to approve or return");
    }
    if (!result) return notFound("Work order not found");

    const wo = await getWorkOrderById(id, scope);
    if (wo?.assignedTo) {
      const action = parsed.data.decision === "Approved" ? "approved" : "returned";
      createNotification({
        staffId: wo.assignedTo.id,
        title: `Work order ${action}`,
        body: `${wo.csiWoNo} — ${wo.title}`,
        category: "Approval",
        linkUrl: `/wo/${id}`,
      }).catch((e) => console.error("[notification] create failed", e));
    }

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/:id/approve] POST error", err);
    return internalError(reqId);
  }
}
