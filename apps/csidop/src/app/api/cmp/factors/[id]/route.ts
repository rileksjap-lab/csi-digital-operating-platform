import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, noContent, notFound, zodError, internalError } from "@/lib/response";
import { cmpFactorPatchSchema } from "@/lib/validations/cmp.schema";
import { getFactorById, updateFactor, deleteFactor } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const factor = await getFactorById(id);
    if (!factor) return notFound("Factor not found");
    return ok(factor);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/factors/:id] GET error", err);
    return internalError(reqId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "manage_hierarchy");

    const { id } = await params;
    const body = await request.json();
    const parsed = cmpFactorPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const factor = await updateFactor(id, parsed.data, session);
    return ok(factor);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/factors/:id] PATCH error", err);
    return internalError(reqId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "manage_hierarchy");

    const { id } = await params;
    await deleteFactor(id, session);
    return noContent();
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/factors/:id] DELETE error", err);
    return internalError(reqId);
  }
}
