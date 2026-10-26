import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireKpiAuth } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { saveScores } from "@/lib/repositories/kpi-appraisal.repo";
import { scoresSchema } from "@/lib/validations/kpi-appraisal.schema";
import { respondFail } from "@/lib/kpi/respond";

// Saves ratings for whichever part of the form the caller may edit right now.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireKpiAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return badRequest("Invalid appraisal id");
    const parsed = scoresSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await saveScores(id, session, parsed.data.scores);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals/:id/scores] PUT error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
