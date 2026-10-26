import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireKpiAuth } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import { getAppraisal } from "@/lib/repositories/kpi-appraisal.repo";
import { respondFail } from "@/lib/kpi/respond";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireKpiAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return badRequest("Invalid appraisal id");
    const result = await getAppraisal(id, session);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals/:id] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
