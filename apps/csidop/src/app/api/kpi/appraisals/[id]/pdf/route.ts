import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { badRequest, internalError } from "@/lib/response";
import { getAppraisal } from "@/lib/repositories/kpi-appraisal.repo";
import { appraisalFileName, buildAppraisalPdf } from "@/lib/kpi/hr-files";
import { respondFail } from "@/lib/kpi/respond";

// The printable appraisal form. Only once the appraisal is finalised, and only
// for people who may open it (the same visibility as the form itself).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return badRequest("Invalid appraisal id");
    const result = await getAppraisal(id, session);
    if (!result.ok) return respondFail(result);
    const d = result.value;
    if (d.status !== "Finalised" && d.status !== "SentToHR") {
      return respondFail({ ok: false, status: 409, message: "The printable form is available once the appraisal is finalised" });
    }
    const pdf = await buildAppraisalPdf(d);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${appraisalFileName(d)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals/:id/pdf] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
