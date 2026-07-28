import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, notFound, conflict, internalError } from "@/lib/response";
import { reviewSelfAssessment } from "@/lib/repositories/skills.repo";
import { selfAssessmentReviewSchema } from "@/lib/validations/skills.schema";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");
    const scope = buildScopeFilter(session);

    const { id } = await params;
    const body = await request.json();
    const parsed = selfAssessmentReviewSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const row = await reviewSelfAssessment(id, parsed.data, scope, session);
    if (!row) return notFound("Self-assessment not found");
    return ok(row);
  } catch (err) {
    if (err instanceof Response) return err;
    const appErr = err as { code?: string; message?: string };
    if (appErr.code === "ALREADY_REVIEWED") {
      return conflict(appErr.message ?? "This self-assessment has already been reviewed");
    }
    console.error("[skills/self-assessments/:id] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
