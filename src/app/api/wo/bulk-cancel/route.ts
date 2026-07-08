import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { cancelWorkOrder } from "@/lib/repositories/wo.repo";

const bulkCancelSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  reason: z.string().min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const body = await request.json();
    const parsed = bulkCancelSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { ids, reason } = parsed.data;
    const scope = buildScopeFilter(session);

    const succeeded: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (const id of ids) {
      try {
        const { result, error } = await cancelWorkOrder(id, reason, session, scope);
        if (error === "INVALID_STATUS_TRANSITION") {
          failed.push({ id, reason: "Already Closed or Cancelled" });
        } else if (!result) {
          failed.push({ id, reason: "Not found or out of scope" });
        } else {
          succeeded.push(id);
        }
      } catch (e) {
        console.error("[wo/bulk-cancel] failed for id", id, e);
        failed.push({ id, reason: "Server error" });
      }
    }

    return ok({ succeeded, failed });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[wo/bulk-cancel] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
