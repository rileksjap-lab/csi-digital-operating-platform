import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { transition } from "@/lib/repositories/kpi-appraisal.repo";
import { transitionSchema } from "@/lib/validations/kpi-appraisal.schema";
import { respondFail } from "@/lib/kpi/respond";

// One workflow step (submit, return, finalise, reopen, send to HR). The rules
// live in lib/kpi/workflow.ts; a refused step explains what is missing.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return badRequest("Invalid appraisal id");
    const parsed = transitionSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await transition(id, session, parsed.data.action, parsed.data.note);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals/:id/transition] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
