import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { requireSystemConfig } from "@/lib/validations/admin.schema";
import { ok, zodError, internalError } from "@/lib/response";
import { listQuestionsAdmin, createQuestion } from "@/lib/repositories/it-knowledge.repo";
import { itKnowledgeQuestionCreateSchema } from "@/lib/validations/it-knowledge.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const rows = await listQuestionsAdmin();
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/it-knowledge/questions] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json();
    const parsed = itKnowledgeQuestionCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const row = await createQuestion(parsed.data, session);
    return ok(row);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/it-knowledge/questions] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
