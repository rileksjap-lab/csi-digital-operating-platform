import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireKpiAuth, requireRole } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { sendToHr } from "@/lib/repositories/kpi-hr.repo";
import { respondFail } from "@/lib/kpi/respond";

const bodySchema = z.object({ cycleId: z.string().uuid(), resend: z.boolean().optional() });

// Emails the summary and the per-person PDFs to the HR address(es) set for the
// cycle, then marks the finalised appraisals as sent. HOD or SVP only.
export async function POST(request: NextRequest) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD", "SVP");
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await sendToHr(parsed.data.cycleId, session, { resend: parsed.data.resend ?? false });
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/hr-report/send] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
