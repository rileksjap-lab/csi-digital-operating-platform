import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { getUtilization } from "@/lib/repositories/capacity.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const scope = buildScopeFilter(session);
    const deptCode = request.nextUrl.searchParams.get("deptCode") ?? undefined;
    const band = request.nextUrl.searchParams.get("band") ?? undefined;

    const result = await getUtilization({ deptCode, band }, scope);
    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[capacity] GET error", err);
    return internalError(reqId);
  }
}
