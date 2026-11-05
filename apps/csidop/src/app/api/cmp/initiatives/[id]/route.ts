import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, noContent, notFound, zodError, internalError } from "@/lib/response";
import { cmpInitiativePatchSchema } from "@/lib/validations/cmp.schema";
import { getInitiativeById, updateInitiative, deleteInitiative } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const initiative = await getInitiativeById(id);
    if (!initiative) return notFound("Initiative not found");
    return ok(initiative);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/initiatives/:id] GET error", err);
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
    const parsed = cmpInitiativePatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const initiative = await updateInitiative(id, parsed.data, session);
    return ok(initiative);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/initiatives/:id] PATCH error", err);
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
    await deleteInitiative(id, session);
    return noContent();
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/initiatives/:id] DELETE error", err);
    return internalError(reqId);
  }
}
