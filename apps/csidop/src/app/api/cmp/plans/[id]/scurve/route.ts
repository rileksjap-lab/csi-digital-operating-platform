import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { getPlanById, getPlanSCurve } from "@/lib/repositories/cmp.repo";

/**
 * S-Curve data (master deck slide 37, "Overall CMP S-Curve: Baseline vs
 * Forecast vs Actual"), by plan quarter Y1Q1..Y5Q4 with the Year 3 gate.
 * Baseline and Forecast are computed from item weights/dates/forecast dates;
 * Actual is the stored quarterly snapshot history plus today's live value --
 * see getPlanSCurve's doc comment.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const plan = await getPlanById(id);
    if (!plan) return notFound("Plan not found");

    const scurve = await getPlanSCurve(id);
    return ok(scurve);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/scurve] GET error", err);
    return internalError(reqId);
  }
}
