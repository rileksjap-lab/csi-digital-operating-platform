import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, badRequest, notFound, zodError, internalError } from "@/lib/response";
import { patchEffortEntry } from "@/lib/repositories/effort.repo";
import { effortPatchSchema } from "@/lib/validations/wo.schema";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "TeamMember", "TeamLead", "BIMTeamLead", "BIMModeler");

    const { id } = await params;
    const body = await request.json();
    const parsed = effortPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { result, error } = await patchEffortEntry(id, parsed.data, session);

    if (error === "NOT_FOUND") return notFound("Effort entry not found");
    if (error === "NOT_OWN_ENTRY") {
      return badRequest("You can only edit your own effort entries");
    }
    if (error === "WO_CLOSED") {
      return badRequest("Cannot edit effort on a closed work order");
    }
    if (error === "NOT_SAME_DAY") {
      return badRequest("Effort entries can only be edited on the same day they were logged");
    }
    if (!result) return notFound("Effort entry not found");

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[effort/:id] PATCH error", err);
    return internalError(reqId);
  }
}
