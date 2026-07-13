import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { created, notFound, forbidden, zodError, internalError } from "@/lib/response";
import { woTaskCreateSchema } from "@/lib/validations/wo.schema";
import { addWoTask, getWoAssigneeAndStatus } from "@/lib/repositories/wo.repo";

// Same roles as ASSIGN_ROLES on the WO detail page, plus the WO's current
// assignee — mirrors the frontend's canAddTask check exactly (page.tsx),
// which previously allowed assignees to see "+ Add Task" while this route
// silently rejected them.
const TASK_CREATE_ROLES = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;

    const wo = await getWoAssigneeAndStatus(id);
    if (!wo) return notFound("Work order not found");

    const canAddTask =
      wo.status !== "Closed" &&
      wo.status !== "Cancelled" &&
      (TASK_CREATE_ROLES.includes(session.role) || wo.assignedTo === session.staffId);
    if (!canAddTask) return forbidden("You cannot add tasks to this work order");

    const body = await request.json();
    const parsed = woTaskCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const task = await addWoTask(id, parsed.data, session);
    return created(task);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/tasks] POST error", err);
    return internalError(reqId);
  }
}
