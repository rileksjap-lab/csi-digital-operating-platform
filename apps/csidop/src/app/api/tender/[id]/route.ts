import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, notFound, zodError, internalError } from "@/lib/response";
import { getTenderById, patchTender } from "@/lib/repositories/tender.repo";
import { tenderPatchSchema } from "@/lib/validations/tender.schema";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const tender = await getTenderById(id);
    if (!tender) return notFound("Tender not found");
    return ok(tender);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[tender/:id] GET error", err);
    return internalError(reqId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id } = await params;
    const body = await request.json();
    const parsed = tenderPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const updated = await patchTender(id, parsed.data, session);
    if (!updated) return notFound("Tender not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[tender/:id] PATCH error", err);
    return internalError(reqId);
  }
}
