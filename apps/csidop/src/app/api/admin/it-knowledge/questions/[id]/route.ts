import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { requireSystemConfig } from "@/lib/validations/admin.schema";
import { ok, zodError, notFound, internalError } from "@/lib/response";
import { patchQuestion } from "@/lib/repositories/it-knowledge.repo";
import { itKnowledgeQuestionPatchSchema } from "@/lib/validations/it-knowledge.schema";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const { id } = await params;
    const body = await request.json();
    const parsed = itKnowledgeQuestionPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const row = await patchQuestion(id, parsed.data, session);
    if (!row) return notFound("Question not found");
    return ok(row);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/it-knowledge/questions/:id] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
