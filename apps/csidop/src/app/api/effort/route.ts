import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, created, badRequest, notFound, zodError, internalError } from "@/lib/response";
import { listEffortEntries, createEffortEntry } from "@/lib/repositories/effort.repo";
import { effortListQuerySchema, effortCreateSchema } from "@/lib/validations/wo.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);

    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = effortListQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const page = await listEffortEntries(parsed.data, scope);

    return ok(page.rows, {
      total: page.total,
      limit: parsed.data.limit,
      hasNextPage: page.hasNextPage,
      nextCursor: page.nextCursor,
      hasPrevPage: false,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[effort] GET error", err);
    return internalError(reqId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead", "TeamMember", "BIMModeler");

    const body = await request.json();
    const parsed = effortCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const { result, error } = await createEffortEntry(parsed.data, session, scope);

    if (error === "NOT_FOUND") return notFound("Work order not found");
    // WO_CLOSED check removed — allow effort logging on closed WOs for backdated imports
    if (error === "NOT_ASSIGNEE") return badRequest("You must be the current assignee to log effort");
    if (error === "FUTURE_DATE") return badRequest("Log date cannot be in the future");
    if (error === "STAFF_NOT_FOUND") return badRequest("Selected staff member not found");
    if (error === "STAFF_INACTIVE") return badRequest("Selected staff member is not active");
    if (!result) return notFound("Work order not found");

    return created(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[effort] POST error", err);
    return internalError(reqId);
  }
}
