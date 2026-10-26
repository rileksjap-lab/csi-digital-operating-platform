import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { listReportingLines, saveReportingLines } from "@/lib/repositories/kpi-reporting.repo";

// Who each person reports to (their immediate superior), for the appraisal
// workflow. The HOD edits it; the SVP can read it.

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SVP");
    return ok(await listReportingLines(session.departmentId));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/reporting-lines] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

const saveSchema = z.object({
  changes: z
    .array(z.object({ staffId: z.string().uuid(), reportsTo: z.string().uuid().nullable() }))
    .min(1)
    .max(200),
});

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD");
    const parsed = saveSchema.safeParse(await request.json());
    if (!parsed.success) return zodError(parsed.error);

    const result = await saveReportingLines(session.departmentId, parsed.data.changes, session.staffId);
    if (!result.ok) return badRequest(result.message);
    return ok({ changed: result.changed, ...(await listReportingLines(session.departmentId)) });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[kpi/reporting-lines] PUT error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
