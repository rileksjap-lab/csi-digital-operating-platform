import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { listGoNoGoByTender } from "@/lib/repositories/gonogo.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id: tenderId } = await params;
    const evaluations = await listGoNoGoByTender(tenderId);
    return ok(evaluations);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[tender/:id/gonogo] GET error", err);
    return internalError(reqId);
  }
}
