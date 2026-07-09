import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { assignWorkOrder, getWorkOrderById } from "@/lib/repositories/wo.repo";
import { createNotification } from "@/lib/repositories/notification.repo";
import { notifyWoAssigned } from "@/lib/email/notify";

const bulkAssignSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  staffId: z.string().uuid(),
  assignedHours: z.number().positive(),
  reassignReason: z.string().min(1).max(500).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const body = await request.json();
    const parsed = bulkAssignSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { ids, staffId, assignedHours, reassignReason } = parsed.data;
    const scope = buildScopeFilter(session);

    const succeeded: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (const id of ids) {
      try {
        const result = await assignWorkOrder(
          id,
          { staffId, assignedHours, reassignReason },
          session,
          scope
        );
        if (!result) {
          failed.push({ id, reason: "Not found or out of scope" });
          continue;
        }
        succeeded.push(id);

        if (staffId !== session.staffId) {
          const wo = await getWorkOrderById(id, scope);
          createNotification({
            staffId,
            title: `Work order assigned to you`,
            body: wo ? `${wo.csiWoNo} — ${wo.title}` : undefined,
            category: "WorkOrder",
            linkUrl: `/wo/${id}`,
          }).catch((e) => console.error("[notification] create failed", e));

          if (wo) {
            notifyWoAssigned(
              staffId,
              session.staffId,
              {
                id,
                csiWoNo: wo.csiWoNo,
                title: wo.title,
                priority: wo.priorityInterdepart,
                dueDate: wo.dueDate ?? undefined,
              },
              assignedHours
            );
          }
        }
      } catch (e) {
        console.error("[wo/bulk-assign] failed for id", id, e);
        failed.push({ id, reason: "Server error" });
      }
    }

    return ok({ succeeded, failed });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[wo/bulk-assign] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
