import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireKpiAuth, requireRole } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import { getHrReport } from "@/lib/repositories/kpi-hr.repo";
import { respondFail } from "@/lib/kpi/respond";

// What HR would receive: who is ready, who is not, where it would be sent.
export async function GET(request: NextRequest) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD", "SVP");
    const cycleId = new URL(request.url).searchParams.get("cycleId");
    if (!cycleId || !z.string().uuid().safeParse(cycleId).success) return badRequest("cycleId is required");
    const result = await getHrReport(cycleId, session);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/hr-report] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
