import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { getOoLeaderboard } from "@/lib/repositories/tender.repo";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const leaderboard = await getOoLeaderboard();
    return ok(leaderboard);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[tender/leaderboard] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
