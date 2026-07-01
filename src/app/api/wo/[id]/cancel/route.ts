import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, badRequest, internalError } from "@/lib/response";
import { cancelWorkOrder } from "@/lib/repositories/wo.repo";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) return badRequest("Cancellation reason is required");

    const scope = buildScopeFilter(session);
    const { result, error } = await cancelWorkOrder(id, reason, session, scope);

    if (error === "INVALID_STATUS_TRANSITION") {
      return badRequest("Cannot cancel a WO that is already Closed or Cancelled");
    }
    if (!result) return notFound("Work order not found");

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[wo/:id/cancel] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
