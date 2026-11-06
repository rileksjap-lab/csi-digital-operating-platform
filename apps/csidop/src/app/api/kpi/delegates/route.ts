import type { NextRequest } from "next/server";
import { requireKpiAuth, requireRole } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { listDelegateCandidates } from "@/lib/repositories/kpi-config.repo";

// Solution Managers the HOD can name as acting HOD while away. HOD only.
export async function GET(request: NextRequest) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD");
    return ok(await listDelegateCandidates(session.departmentId));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/delegates] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
