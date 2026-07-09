import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import {
  listDiscussions,
  createDiscussionPost,
} from "@/lib/repositories/discussion.repo";
import { createNotification } from "@/lib/repositories/notification.repo";
import { query } from "@/lib/db/pool";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    void session;

    const posts = await listDiscussions(id);
    return ok(posts);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/:id/discussion] GET error", err);
    return internalError(reqId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id: woId } = await params;
    const body = await request.json().catch(() => ({}));

    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text || text.length > 5000) {
      return badRequest("body is required (max 5000 chars)");
    }

    const parentId =
      typeof body.parentId === "string" ? body.parentId : undefined;

    const result = await createDiscussionPost(
      woId,
      session.staffId,
      text,
      parentId
    );

    // Notify: WO assignee, parent reply author, and @mentioned staff
    const woResult = await query<{
      assignedto: string | null;
      csiWoNo: string;
    }>(
      `SELECT assignedto, csi_wo_no AS "csiWoNo" FROM csi_wo WHERE id = $1`,
      [woId]
    );
    const wo = woResult.rows[0];
    if (wo) {
      const notifyIds = new Set<string>();

      if (wo.assignedto && wo.assignedto !== session.staffId) {
        notifyIds.add(wo.assignedto);
      }

      if (parentId) {
        const parentResult = await query<{ posted_by: string }>(
          `SELECT posted_by FROM wo_discussion WHERE id = $1`,
          [parentId]
        );
        const parentAuthor = parentResult.rows[0]?.posted_by;
        if (parentAuthor && parentAuthor !== session.staffId) {
          notifyIds.add(parentAuthor);
        }
      }

      // Extract @mentions and resolve to staff IDs
      const mentions = text.match(/@[\w\s]+/g);
      if (mentions && mentions.length > 0) {
        const mentionNames = mentions.map((m: string) => m.slice(1).trim());
        const mentionResult = await query<{ id: string }>(
          `SELECT id FROM staff WHERE name = ANY($1) AND status = 'Active'`,
          [mentionNames]
        );
        for (const row of mentionResult.rows) {
          if (row.id !== session.staffId) {
            notifyIds.add(row.id);
          }
        }
      }

      for (const staffId of notifyIds) {
        const isMentioned = mentions && notifyIds.has(staffId);
        createNotification({
          staffId,
          title: isMentioned
            ? "You were mentioned in a WO discussion"
            : parentId
              ? "New reply on WO discussion"
              : "New comment on WO",
          body: `${wo.csiWoNo} — ${text.slice(0, 80)}${text.length > 80 ? "..." : ""}`,
          category: "WorkOrder",
          linkUrl: `/wo/${woId}`,
        }).catch((e) => console.error("[notification] discussion failed", e));
      }
    }

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    if (err instanceof Error && err.message === "PARENT_NOT_FOUND") {
      return badRequest("Parent post not found in this WO");
    }
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/:id/discussion] POST error", err);
    return internalError(reqId);
  }
}
