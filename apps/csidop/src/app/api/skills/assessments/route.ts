import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { listAssessments, upsertAssessment } from "@/lib/repositories/skills.repo";
import { assessmentListQuerySchema, assessmentUpsertSchema } from "@/lib/validations/skills.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = assessmentListQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const rows = await listAssessments(parsed.data, scope);
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills/assessments] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const body = await request.json();
    const parsed = assessmentUpsertSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const row = await upsertAssessment(parsed.data, session);
    return ok(row);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills/assessments] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
