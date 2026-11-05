import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { getPlanById, getPlanSCurve } from "@/lib/repositories/cmp.repo";

/**
 * S-Curve data (master deck slide 37, "Overall CMP S-Curve: Baseline vs
 * Actual vs Forecast"). The Baseline/Planned line is a real deterministic
 * curve computed from item weights/dates, sampled across the plan's date
 * range -- see getPlanSCurve's doc comment for why Actual is reported as
 * a single point at today, not a fabricated historical line (no
 * cmp_snapshots history exists yet to plot one honestly).
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
