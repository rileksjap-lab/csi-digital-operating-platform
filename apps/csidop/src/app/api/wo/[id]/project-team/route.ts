import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { created, notFound, badRequest, conflict, zodError, internalError } from "@/lib/response";
import { z } from "zod";
import { woProjectMemberCreateSchema } from "@/lib/validations/wo.schema";
import { addProjectMember } from "@/lib/repositories/wo.repo";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return notFound("Work order not found");
    const parsed = woProjectMemberCreateSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);

    const result = await addProjectMember(id, parsed.data, session, buildScopeFilter(session));
    if ("notFound" in result) return notFound("Work order not found");
    if ("error" in result) {
      if (result.error === "ALREADY_MEMBER") return conflict("This person is already on the project team");
      if (result.error === "INVALID_STAFF") return badRequest("Selected staff member was not found or is not active");
      return badRequest("Project team can only be set on a Tender / RFP work order that has been marked Won");
    }
    return created({ id: result.memberId });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/project-team] POST error", err);
    return internalError(reqId);
  }
}
