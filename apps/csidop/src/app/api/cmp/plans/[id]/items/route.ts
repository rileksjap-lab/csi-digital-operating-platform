import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { getPlanById, getPlanItemsWithProgress } from "@/lib/repositories/cmp.repo";

/**
 * Every item in the plan, flattened, with its editable progress fields and
 * computed score/RAG already attached -- one query. Feeds CMP-02 Progress
 * Update, which previously built this same list client-side via a
 * workstream->initiative->factor->item fan-out (~100 requests) and then
 * had every row independently fetch its own /update + /score (another
 * ~2 per item) -- ~500 requests total for a 198-item plan. Reported as
 * genuinely slow by a new user; this route is the fix.
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

    const items = await getPlanItemsWithProgress(id);
    return ok(items);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/items] GET error", err);
    return internalError(reqId);
  }
}
