import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireKpiAuth } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { recordOneOnOne, acknowledgeOneOnOne } from "@/lib/repositories/kpi-appraisal.repo";
import { oneOnOneSchema } from "@/lib/validations/kpi-appraisal.schema";
import { respondFail } from "@/lib/kpi/respond";

// The superior records the 1:1 meeting.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireKpiAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return badRequest("Invalid appraisal id");
    const parsed = oneOnOneSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await recordOneOnOne(id, session, parsed.data);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals/:id/one-on-one] PUT error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

// The employee confirms the meeting took place.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireKpiAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return badRequest("Invalid appraisal id");
    const result = await acknowledgeOneOnOne(id, session);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals/:id/one-on-one] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
