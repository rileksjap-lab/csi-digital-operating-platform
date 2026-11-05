import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { approveBaseline } from "@/lib/repositories/cmp.repo";

/** HOD-only (approve_baseline capability). Requires the plan to already be Locked. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "approve_baseline");

    const { id } = await params;
    const plan = await approveBaseline(id, session);
    return ok(plan);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/baseline/approve] POST error", err);
    return internalError(reqId);
  }
}
