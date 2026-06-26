import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, badRequest, zodError, internalError } from "@/lib/response";
import { getWorkOrderById, patchWorkOrder } from "@/lib/repositories/wo.repo";
import { woPatchSchema } from "@/lib/validations/wo.schema";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const scope = buildScopeFilter(session);
    const wo = await getWorkOrderById(id, scope);
    if (!wo) return notFound("Work order not found");
    return ok(wo);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/:id] GET error", err);
    return internalError(reqId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id } = await params;
    const body = await request.json();
    const parsed = woPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const updated = await patchWorkOrder(id, parsed.data, session, scope);
    if (!updated) return notFound("Work order not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/:id] PATCH error", err);
    return internalError(reqId);
  }
}
