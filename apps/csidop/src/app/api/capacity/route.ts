import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { getUtilization } from "@/lib/repositories/capacity.repo";
import { utilizationQuerySchema } from "@/lib/validations/capacity.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const parsed = utilizationQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const result = await getUtilization(parsed.data, scope);
    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[capacity] GET error", err);
    return internalError(reqId);
  }
}
