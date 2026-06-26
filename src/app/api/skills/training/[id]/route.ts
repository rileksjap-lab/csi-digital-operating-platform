import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, notFound, zodError, internalError } from "@/lib/response";
import { patchTrainingPlan } from "@/lib/repositories/skills.repo";
import { trainingPatchSchema } from "@/lib/validations/skills.schema";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id } = await params;
    const body = await request.json();
    const parsed = trainingPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const result = await patchTrainingPlan(id, parsed.data, session);
    if (!result) return notFound("Training plan not found");

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills/training/:id] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
