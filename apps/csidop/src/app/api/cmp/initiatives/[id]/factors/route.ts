import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, created, notFound, zodError, internalError } from "@/lib/response";
import { cmpFactorCreateSchema } from "@/lib/validations/cmp.schema";
import { getInitiativeById, listFactors, createFactor } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const initiative = await getInitiativeById(id);
    if (!initiative) return notFound("Initiative not found");
    const factors = await listFactors(id);
    return ok(factors);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/initiatives/:id/factors] GET error", err);
    return internalError(reqId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "manage_hierarchy");

    const { id } = await params;
    const body = await request.json();
    const parsed = cmpFactorCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const factor = await createFactor(id, parsed.data, session);
    return created(factor);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/initiatives/:id/factors] POST error", err);
    return internalError(reqId);
  }
}
