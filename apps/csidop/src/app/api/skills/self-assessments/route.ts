import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, conflict, badRequest, internalError } from "@/lib/response";
import { listSelfAssessments, submitSelfAssessment } from "@/lib/repositories/skills.repo";
import { selfAssessmentListQuerySchema, selfAssessmentSubmitSchema } from "@/lib/validations/skills.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = selfAssessmentListQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const rows = await listSelfAssessments(parsed.data, scope);
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills/self-assessments] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);

    const body = await request.json();
    const parsed = selfAssessmentSubmitSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const row = await submitSelfAssessment(parsed.data, session);
    return ok(row);
  } catch (err) {
    if (err instanceof Response) return err;
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return conflict("You've already submitted a self-assessment for this skill this quarter");
    }
    const appErr = err as { code?: string; message?: string };
    if (appErr.code === "INVALID_ANSWERS") {
      return badRequest(appErr.message ?? "Invalid answers");
    }
    console.error("[skills/self-assessments] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
