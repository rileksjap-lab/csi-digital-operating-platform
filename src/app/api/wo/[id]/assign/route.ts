import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, badRequest, zodError, internalError } from "@/lib/response";
import { assignWorkOrder, getWorkOrderById } from "@/lib/repositories/wo.repo";
import { woAssignSchema } from "@/lib/validations/wo.schema";
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
    const parsed = woAssignSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const result = await assignWorkOrder(id, parsed.data, session, scope);
    if (!result) return notFound("Work order not found");

    if (parsed.data.staffId !== session.staffId) {
      const wo = await getWorkOrderById(id, scope);
      createNotification({
        staffId: parsed.data.staffId,
        title: `Work order assigned to you`,
        body: wo ? `${wo.csiWoNo} — ${wo.title}` : undefined,
        category: "WorkOrder",
        linkUrl: `/wo/${id}`,
      }).catch((e) => console.error("[notification] create failed", e));
    }

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/:id/assign] POST error", err);
    return internalError(reqId);
  }
}
