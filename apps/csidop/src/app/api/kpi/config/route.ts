import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { listCycles } from "@/lib/repositories/kpi-config.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SVP");
    return ok(await listCycles());
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/config] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
