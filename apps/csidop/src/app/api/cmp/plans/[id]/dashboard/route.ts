import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { getPlanById, getPlanDashboard } from "@/lib/repositories/cmp.repo";

/**
 * Readiness and RAG Dashboard (required module 12 in the master prompt).
 * Overall CMP Readiness + per-workstream readiness, computed live via the
 * same nested rollup chain as calculations.ts's rollupReadiness, plus a
 * RAG tally and Red/Amber exception lists for management review.
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

    const dashboard = await getPlanDashboard(id);
    return ok(dashboard);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/dashboard] GET error", err);
    return internalError(reqId);
  }
}
