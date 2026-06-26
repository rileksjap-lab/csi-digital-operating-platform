import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { noContent, notFound, badRequest, forbidden, internalError } from "@/lib/response";
import { softDeleteEvidence } from "@/lib/repositories/evidence.repo";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const scope = buildScopeFilter(session);

    const { success, error } = await softDeleteEvidence(id, session, scope);

    if (error === "NOT_FOUND") return notFound("Evidence item not found");
    if (error === "ALREADY_REMOVED") return badRequest("Evidence item has already been removed");
    if (error === "APPROVAL_LOCK") {
      return forbidden("WO is in approval/closed state; Team Lead or above required to remove evidence");
    }
    if (error === "FORBIDDEN") return forbidden("You can only remove your own evidence items");
    if (!success) return notFound("Evidence item not found");

    return noContent();
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[evidence/:id] DELETE error", err);
    return internalError(reqId);
  }
}
