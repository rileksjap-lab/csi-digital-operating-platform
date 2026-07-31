import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { getTeamActivity } from "@/lib/repositories/team-activity.repo";
import { teamActivityQuerySchema } from "@/lib/validations/capacity.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");
    const scope = buildScopeFilter(session);

    const parsed = teamActivityQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) return zodError(parsed.error);

    const rows = await getTeamActivity(parsed.data.period, scope);
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[team-activity] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
