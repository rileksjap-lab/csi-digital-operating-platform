import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { getSkillAssessmentHistory } from "@/lib/repositories/skills.repo";
import { skillHistoryQuerySchema } from "@/lib/validations/skills.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = skillHistoryQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const rows = await getSkillAssessmentHistory(parsed.data.staffId, scope);
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills/history] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
