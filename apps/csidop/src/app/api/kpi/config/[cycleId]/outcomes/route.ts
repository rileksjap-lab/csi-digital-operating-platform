import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireKpiAuth, requireRole } from "@/lib/auth/guards";
import { ok, notFound, conflict, badRequest, zodError, internalError } from "@/lib/response";
import { getCycleConfig, saveOutcomeBands } from "@/lib/repositories/kpi-config.repo";
import { outcomeSaveSchema } from "@/lib/validations/kpi-config.schema";

// Replaces the score → outcome table (PIP, increment, promotion ...). HOD only.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD");
    const { cycleId } = await params;
    if (!z.string().uuid().safeParse(cycleId).success) return badRequest("Invalid cycle id");
    const parsed = outcomeSaveSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await saveOutcomeBands(cycleId, parsed.data, session.staffId);
    if (result === "not_found") return notFound("KPI cycle not found");
    if (result === "locked") return conflict("Some appraisals in this cycle are already finalised, so the criteria can no longer be changed. Reopen those appraisals first, or set up the next cycle.");
    return ok(await getCycleConfig(cycleId));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/config/outcomes] PUT error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
