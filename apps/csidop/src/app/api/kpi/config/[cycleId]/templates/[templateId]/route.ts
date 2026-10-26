import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, notFound, conflict, badRequest, zodError, internalError } from "@/lib/response";
import { getCycleConfig, saveTemplate } from "@/lib/repositories/kpi-config.repo";
import { templateSaveSchema } from "@/lib/validations/kpi-config.schema";

const idSchema = z.string().uuid();

// Replaces the KRA lines of one role template. Weights must total 100%.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ cycleId: string; templateId: string }> }) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD");
    const { cycleId, templateId } = await params;
    if (!idSchema.safeParse(cycleId).success || !idSchema.safeParse(templateId).success) return badRequest("Invalid id");
    const parsed = templateSaveSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);
    const result = await saveTemplate(cycleId, templateId, parsed.data, session.staffId);
    if (result === "not_found") return notFound("KPI template not found");
    if (result === "locked") return conflict("Some appraisals in this cycle are already finalised, so the criteria can no longer be changed. Reopen those appraisals first, or set up the next cycle.");
    return ok(await getCycleConfig(cycleId));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/config/templates] PUT error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
