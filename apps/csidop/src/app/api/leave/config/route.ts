import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { applyLeaveConfig, getLeaveConfig } from "@/lib/repositories/leave-config.repo";
import { leaveConfigSchema } from "@/lib/validations/leave.schema";
import { respondFail } from "@/lib/kpi/respond";

// Leave setup: HOD only.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD");
    const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return badRequest("Invalid year");
    return ok(await getLeaveConfig(session, year));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[leave/config] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD");
    const parsed = leaveConfigSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return zodError(parsed.error);
    const result = await applyLeaveConfig(session, parsed.data);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[leave/config] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
