import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import {
  listAnnouncements,
  createAnnouncement,
} from "@/lib/repositories/announcement.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    void session;

    const pinned = request.nextUrl.searchParams.get("pinned") === "true";
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 20);

    const rows = await listAnnouncements({
      pinnedOnly: pinned,
      limit: Math.min(limit, 50),
    });
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[announcements] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager");

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const priority = ["normal", "important", "urgent"].includes(body.priority)
      ? body.priority
      : "normal";
    const pinned = body.pinned === true;
    const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : null;
    const eventDate = typeof body.eventDate === "string" ? body.eventDate : null;

    if (!title || title.length > 200) return badRequest("Title required (max 200 chars)");
    if (!text || text.length > 5000) return badRequest("Body required (max 5000 chars)");

    const result = await createAnnouncement({
      title,
      body: text,
      priority,
      pinned,
      expiresAt,
      eventDate,
      createdBy: session.staffId,
    });
    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[announcements] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
