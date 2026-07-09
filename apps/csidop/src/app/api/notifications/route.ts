import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { listNotifications, markAllAsRead } from "@/lib/repositories/notification.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get("unreadOnly") === "true";
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10), 50);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

    const result = await listNotifications(session.staffId, { unreadOnly, limit, offset });
    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[notifications] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const count = await markAllAsRead(session.staffId);
    return ok({ markedCount: count });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[notifications] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
