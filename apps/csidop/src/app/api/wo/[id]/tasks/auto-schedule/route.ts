import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, forbidden, badRequest, internalError } from "@/lib/response";
import { autoScheduleTasks, getWoAssigneeAndStatus } from "@/lib/repositories/wo.repo";

// Same permission as adding tasks: CSI managers, or the WO's current assignee.
const SCHEDULE_ROLES = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return notFound("Work order not found");

    const wo = await getWoAssigneeAndStatus(id);
    if (!wo) return notFound("Work order not found");
    const allowed =
      wo.status !== "Closed" &&
      wo.status !== "Cancelled" &&
      (SCHEDULE_ROLES.includes(session.role) || wo.assignedTo === session.staffId);
    if (!allowed) return forbidden("You cannot schedule tasks on this work order");

    const result = await autoScheduleTasks(id, session, buildScopeFilter(session));
    if ("notFound" in result) return notFound("Work order not found");
    if ("error" in result) {
      if (result.error === "NO_DUE_DATE") return badRequest("Set a due date on the work order first, then auto-schedule");
      if (result.error === "INVALID_RANGE") return badRequest("The due date is before the work order's start date");
      return badRequest("There are no unscheduled active tasks to schedule");
    }
    return ok({ scheduled: result.scheduled });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/tasks/auto-schedule] POST error", err);
    return internalError(reqId);
  }
}
