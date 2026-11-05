import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { lockBaseline } from "@/lib/repositories/cmp.repo";

/** HOD-only (lock_plan capability). Blocked with 409 if any sibling group fails weight validation (TC01). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "lock_plan");

    const { id } = await params;
    const plan = await lockBaseline(id, session);
    return ok(plan);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/baseline/lock] POST error", err);
    return internalError(reqId);
  }
}
