import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { listActiveQuizQuestions } from "@/lib/repositories/it-knowledge.repo";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const rows = await listActiveQuizQuestions();
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[it-knowledge/quiz] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
