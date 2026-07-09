import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { created, zodError, internalError } from "@/lib/response";
import { woTaskCreateSchema } from "@/lib/validations/wo.schema";
import { addWoTask } from "@/lib/repositories/wo.repo";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id } = await params;
    const body = await request.json();
    const parsed = woTaskCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const task = await addWoTask(id, parsed.data, session);
    return created(task);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/tasks] POST error", err);
    return internalError(reqId);
  }
}
