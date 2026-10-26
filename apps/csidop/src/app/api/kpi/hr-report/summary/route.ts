import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { badRequest, internalError } from "@/lib/response";
import { buildSummaryFile } from "@/lib/repositories/kpi-hr.repo";
import { respondFail } from "@/lib/kpi/respond";

// The one-line-per-person summary as a CSV download (opens in Excel).
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SVP");
    const cycleId = new URL(request.url).searchParams.get("cycleId");
    if (!cycleId || !z.string().uuid().safeParse(cycleId).success) return badRequest("cycleId is required");
    const result = await buildSummaryFile(cycleId, session);
    if (!result.ok) return respondFail(result);
    return new Response(new Uint8Array(result.value.csv), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="KPI_summary.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/hr-report/summary] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
