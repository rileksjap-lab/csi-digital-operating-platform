import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { markAsRead } from "@/lib/repositories/notification.repo";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const updated = await markAsRead(id, session.staffId);
    return ok({ updated });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[notifications/read] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
