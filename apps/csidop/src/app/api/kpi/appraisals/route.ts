import type { NextRequest } from "next/server";
import { requireKpiAuth, requireRole } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { listCycles } from "@/lib/repositories/kpi-config.repo";
import { createAppraisals, listAppraisals } from "@/lib/repositories/kpi-appraisal.repo";
import { openSchema } from "@/lib/validations/kpi-appraisal.schema";
import { respondFail } from "@/lib/kpi/respond";

// The appraisals a person may see in a cycle: their own, the ones they review
// or finalise, and, for the HOD and SVP, everyone in scope.
export async function GET(request: NextRequest) {
  try {
    const session = await requireKpiAuth(request);
    const wide = session.role === "HOD" || session.role === "SVP";
    const cycles = (await listCycles()).filter((c) => wide || c.status !== "Draft");
    const asked = new URL(request.url).searchParams.get("cycleId");
    const chosen = cycles.find((c) => c.id === asked) ?? cycles.find((c) => c.status === "Open") ?? cycles[0] ?? null;
    const appraisals = chosen ? await listAppraisals(chosen.id, session) : [];
    return ok({ cycles, cycleId: chosen?.id ?? null, appraisals });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

// HOD opens appraisals for everyone in the department who is not in the cycle yet.
export async function POST(request: NextRequest) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD");
    const parsed = openSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await createAppraisals(parsed.data.cycleId, session);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/appraisals] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
