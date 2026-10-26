import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { listCycles, createCycleCopy } from "@/lib/repositories/kpi-config.repo";
import { cycleCreateSchema } from "@/lib/validations/kpi-config.schema";

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

// HOD only: start a new cycle (for example the next half-year) as a copy of an existing one.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD");
    const parsed = cycleCreateSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await createCycleCopy(parsed.data, session.staffId);
    if (!result.ok) return badRequest(result.message);
    return ok({ id: result.id, cycles: await listCycles() });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/config] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
