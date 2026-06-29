import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, badRequest, zodError, internalError } from "@/lib/response";
import { completeWorkOrder } from "@/lib/repositories/wo.repo";
import { woCompleteSchema } from "@/lib/validations/wo.schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = woCompleteSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const { result, error } = await completeWorkOrder(
      id,
      parsed.data.completionNote,
      session,
      scope
    );

    if (error === "INVALID_STATUS_TRANSITION") {
      return badRequest("WO must be in Open or InProgress status to complete");
    }
    if (!result) return notFound("Work order not found");
    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/:id/complete] POST error", err);
    return internalError(reqId);
  }
}
