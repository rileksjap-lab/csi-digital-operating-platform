import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireKpiAuth, requireRole } from "@/lib/auth/guards";
import { ok, notFound, badRequest, zodError, internalError } from "@/lib/response";
import { getCycleConfig, updateCycle } from "@/lib/repositories/kpi-config.repo";
import { cycleSaveSchema } from "@/lib/validations/kpi-config.schema";

const idSchema = z.string().uuid();

export async function GET(request: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD", "SVP");
    const { cycleId } = await params;
    if (!idSchema.safeParse(cycleId).success) return badRequest("Invalid cycle id");
    const data = await getCycleConfig(cycleId);
    if (!data) return notFound("KPI cycle not found");
    return ok(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/config/:cycleId] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

// Cycle name, dates, status and the certification points rules. HOD only.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ cycleId: string }> }) {
  try {
    const session = await requireKpiAuth(request);
    requireRole(session, "HOD");
    const { cycleId } = await params;
    if (!idSchema.safeParse(cycleId).success) return badRequest("Invalid cycle id");
    const parsed = cycleSaveSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await updateCycle(cycleId, parsed.data, session.staffId);
    if (result === "not_found") return notFound("KPI cycle not found");
    return ok(await getCycleConfig(cycleId));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/config/:cycleId] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
