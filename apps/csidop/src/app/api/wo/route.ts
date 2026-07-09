import type { NextRequest } from "next/server";
import { requireAuth, requireRole, buildScopeFilter } from "@/lib/auth/guards";
import { ok, created, zodError, internalError } from "@/lib/response";
import { woListQuerySchema, woCreateSchema } from "@/lib/validations/wo.schema";
import { listWorkOrders, createWorkOrder } from "@/lib/repositories/wo.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const parsed = woListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const result = await listWorkOrders(parsed.data, scope);

    return ok(result.rows, {
      total: result.total,
      limit: parsed.data.limit,
      hasNextPage: result.hasNextPage,
      nextCursor: result.nextCursor,
      hasPrevPage: false,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo] GET error", err);
    return internalError(reqId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const body = await request.json();
    const parsed = woCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const wo = await createWorkOrder(parsed.data, session);
    return created(wo);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo] POST error", err);
    return internalError(reqId);
  }
}
