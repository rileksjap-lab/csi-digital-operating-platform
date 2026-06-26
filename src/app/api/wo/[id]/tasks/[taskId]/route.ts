import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, notFound, zodError, internalError } from "@/lib/response";
import { woTaskPatchSchema } from "@/lib/validations/wo.schema";
import { updateWoTask, deleteWoTask } from "@/lib/repositories/wo.repo";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    await requireAuth(request);
    const { taskId } = await params;

    const body = await request.json();
    const parsed = woTaskPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const task = await updateWoTask(taskId, parsed.data);
    if (!task) return notFound("Task not found");
    return ok(task);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/tasks] PATCH error", err);
    return internalError(reqId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  try {
    await requireAuth(request);
    const { taskId } = await params;

    const deleted = await deleteWoTask(taskId);
    if (!deleted) return notFound("Task not found");
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/tasks] DELETE error", err);
    return internalError(reqId);
  }
}
