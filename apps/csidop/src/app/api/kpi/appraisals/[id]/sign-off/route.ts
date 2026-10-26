import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { saveSignOff } from "@/lib/repositories/kpi-appraisal.repo";
import { signOffSchema } from "@/lib/validations/kpi-appraisal.schema";
import { respondFail } from "@/lib/kpi/respond";

// The sign-off part of the form: career recommendation ticks, SVP-Operations
// name and date, and the SVP-Department signature. Each caller can only change
// the parts the workflow rules give them.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return badRequest("Invalid appraisal id");
    const parsed = signOffSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await saveSignOff(id, session, parsed.data);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals/:id/sign-off] PUT error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
