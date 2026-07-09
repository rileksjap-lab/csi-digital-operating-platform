import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { getStaffUtilizationDetail } from "@/lib/repositories/capacity.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { staffId } = await params;
    const scope = buildScopeFilter(session);

    const result = await getStaffUtilizationDetail(staffId, scope);
    if (!result) return notFound("Staff member not found or out of scope");

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[capacity/:staffId] GET error", err);
    return internalError(reqId);
  }
}
