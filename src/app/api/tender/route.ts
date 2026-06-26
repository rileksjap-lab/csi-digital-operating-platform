import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, created, zodError, internalError } from "@/lib/response";
import {
  tenderListQuerySchema,
  tenderCreateSchema,
} from "@/lib/validations/tender.schema";
import { listTenders, createTender } from "@/lib/repositories/tender.repo";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const parsed = tenderListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) return zodError(parsed.error);

    const result = await listTenders(parsed.data);

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
    console.error("[tender] GET error", err);
    return internalError(reqId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager", "TeamLead", "BIMTeamLead");

    const body = await request.json();
    const parsed = tenderCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const tender = await createTender(parsed.data, session);
    return created(tender);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[tender] POST error", err);
    return internalError(reqId);
  }
}
