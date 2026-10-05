import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { z } from "zod";
import { removeProjectMember } from "@/lib/repositories/wo.repo";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id, memberId } = await params;
    if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(memberId).success) {
      return notFound("Project team member not found");
    }
    const removed = await removeProjectMember(id, memberId, session, buildScopeFilter(session));
    if (!removed) return notFound("Project team member not found");
    return ok({ removed: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/project-team/:memberId] DELETE error", err);
    return internalError(reqId);
  }
}
