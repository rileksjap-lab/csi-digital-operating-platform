import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { actorOf, listColleagues, listLeaveTypes } from "@/lib/repositories/leave.repo";

// What the Apply form needs: the leave types, who can cover, and whether this person approves anything.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const actor = await actorOf(session);
    const isHod = session.role === "HOD" || session.role === "SVP";
    return ok({
      types: await listLeaveTypes(true),
      colleagues: await listColleagues(session),
      canApprove: isHod || session.role === "SolutionManager" || actor.actingForHod,
      isHod,
      actingForHod: actor.actingForHod,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[leave/meta] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
