import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, conflict, badRequest, internalError } from "@/lib/response";
import { listAttempts, submitAttempt } from "@/lib/repositories/it-knowledge.repo";
import { itKnowledgeAttemptListQuerySchema, itKnowledgeAttemptSubmitSchema } from "@/lib/validations/it-knowledge.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = itKnowledgeAttemptListQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const rows = await listAttempts(parsed.data, scope);
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[it-knowledge/attempts] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);

    const body = await request.json();
    const parsed = itKnowledgeAttemptSubmitSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const row = await submitAttempt(parsed.data.answers, session);
    return ok(row);
  } catch (err) {
    if (err instanceof Response) return err;
    const pgErr = err as { code?: string };
    if (pgErr.code === "23505") {
      return conflict("You've already taken the IT knowledge quiz this quarter");
    }
    const appErr = err as { code?: string; message?: string };
    if (appErr.code && ["NO_ANSWERS", "NO_ACTIVE_QUESTIONS", "INCOMPLETE_ANSWERS", "INVALID_ANSWERS"].includes(appErr.code)) {
      return badRequest(appErr.message ?? "Invalid submission");
    }
    console.error("[it-knowledge/attempts] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
