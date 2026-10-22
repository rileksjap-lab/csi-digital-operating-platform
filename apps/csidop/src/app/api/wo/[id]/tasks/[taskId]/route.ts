import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, notFound, forbidden, badRequest, zodError, internalError } from "@/lib/response";
import { woTaskPatchSchema } from "@/lib/validations/wo.schema";
import { updateWoTask, deleteWoTask, getWoAssigneeAndStatus } from "@/lib/repositories/wo.repo";

// Planned dates feed the Gantt chart, so they follow the same permission as
// adding tasks: CSI managers or the WO's current assignee.
const PLAN_ROLES = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id, taskId } = await params;

    const body = await request.json();
    const parsed = woTaskPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    if (parsed.data.plannedStart !== undefined || parsed.data.plannedEnd !== undefined) {
      const wo = await getWoAssigneeAndStatus(id);
      if (!wo) return notFound("Work order not found");
      if (!PLAN_ROLES.includes(session.role) && wo.assignedTo !== session.staffId) {
        return forbidden("You cannot change planned dates on this work order");
      }
    }

    const task = await updateWoTask(taskId, parsed.data);
    if (!task) return notFound("Task not found");
    return ok(task);
  } catch (err) {
    if (err instanceof Response) return err;
    if ((err as { code?: string }).code === "23514") {
      return badRequest("Planned end must be on or after planned start");
    }
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/tasks] PATCH error", err);
    return internalError(reqId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { taskId } = await params;

    const deleted = await deleteWoTask(taskId, session);
    if (!deleted) return notFound("Task not found");
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/tasks] DELETE error", err);
    return internalError(reqId);
  }
}
