import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { created, zodError, internalError } from "@/lib/response";
import { tenderScoringSchema } from "@/lib/validations/tender.schema";
import { createScoringAndGoNoGo } from "@/lib/repositories/gonogo.repo";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id: tenderId } = await params;
    const body = await request.json();
    const parsed = tenderScoringSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const result = await createScoringAndGoNoGo(
      { ...parsed.data, tenderId },
      session
    );
    return created(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[tender/:id/score] POST error", err);
    return internalError(reqId);
  }
}
