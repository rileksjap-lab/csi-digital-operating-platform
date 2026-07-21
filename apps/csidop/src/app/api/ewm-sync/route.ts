import type { NextRequest } from "next/server";
import { ok, badRequest, internalError } from "@/lib/response";
import { syncFromEwm } from "@/lib/ewm/import";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return badRequest("Unauthorized");
    }

    const summary = await syncFromEwm();
    return ok(summary);
  } catch (err) {
    console.error("[ewm-sync] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
