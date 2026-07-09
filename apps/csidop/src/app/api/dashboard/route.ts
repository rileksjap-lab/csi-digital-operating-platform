import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { getDashboard } from "@/lib/repositories/dashboard.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const data = await getDashboard(scope);
    return ok(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[dashboard] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
