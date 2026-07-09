import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, notFound, badRequest, internalError } from "@/lib/response";
import { updateCertificationStatus } from "@/lib/repositories/skills.repo";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !["Verified", "Unverified", "Expired"].includes(status)) {
      return badRequest("status must be Verified, Unverified, or Expired");
    }

    const updated = await updateCertificationStatus(id, status, session);
    if (!updated) return notFound("Certification not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills/certifications/:id] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
