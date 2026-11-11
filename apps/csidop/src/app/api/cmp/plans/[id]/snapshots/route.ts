import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { getPlanById, takePlanSnapshot } from "@/lib/repositories/cmp.repo";

/**
 * HOD-only (take_snapshot capability). Records today's Baseline / Forecast /
 * Actual for the quarter that contains today. Taking it again in the same
 * quarter refreshes that quarter's row; once the quarter has ended its row is
 * frozen. Never changes any item status, score or evidence.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "take_snapshot");

    const { id } = await params;
    const plan = await getPlanById(id);
    if (!plan) return notFound("Plan not found");

    const snapshot = await takePlanSnapshot(id, { source: "Manual", session });
    return ok(snapshot);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/snapshots] POST error", err);
    return internalError(reqId);
  }
}
