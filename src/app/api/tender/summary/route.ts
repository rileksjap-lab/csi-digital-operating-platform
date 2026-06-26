import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { getTenderSummary } from "@/lib/repositories/tender.repo";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const summary = await getTenderSummary();
    return ok(summary);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[tender/summary] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
