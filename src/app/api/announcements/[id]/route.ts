import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import {
  updateAnnouncement,
  softDeleteAnnouncement,
} from "@/lib/repositories/announcement.repo";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager");
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    await updateAnnouncement(id, {
      title: body.title,
      body: body.body,
      priority: body.priority,
      pinned: body.pinned,
      expiresAt: body.expiresAt,
      eventDate: body.eventDate,
    });
    return ok({ updated: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[announcements] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager");
    const { id } = await params;

    await softDeleteAnnouncement(id, session.staffId);
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[announcements] DELETE error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
