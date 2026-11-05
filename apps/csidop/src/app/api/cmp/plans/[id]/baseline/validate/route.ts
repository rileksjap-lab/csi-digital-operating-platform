import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { getPlanById, validatePlanWeights } from "@/lib/repositories/cmp.repo";

/**
 * TC01: "Sibling weights do not total 100%" -> report which levels fail,
 * without mutating anything. The frontend calls this live while editing
 * weights on CMP-01 (Plan Setup) to drive the per-group valid/invalid
 * indicator; POST /baseline/lock re-runs the same check server-side and
 * blocks if it fails, so this endpoint is a preview, not the enforcement
 * point itself.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const plan = await getPlanById(id);
    if (!plan) return notFound("Plan not found");

    const validation = await validatePlanWeights(id);
    return ok(validation);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/baseline/validate] POST error", err);
    return internalError(reqId);
  }
}
