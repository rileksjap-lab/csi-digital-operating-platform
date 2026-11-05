import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, noContent, notFound, zodError, internalError } from "@/lib/response";
import { cmpItemPatchSchema } from "@/lib/validations/cmp.schema";
import { getItemById, updateItem, deleteItem } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const item = await getItemById(id);
    if (!item) return notFound("Item not found");
    return ok(item);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/items/:id] GET error", err);
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
    const parsed = cmpItemPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const item = await updateItem(id, parsed.data, session);
    return ok(item);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/items/:id] PATCH error", err);
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
    await deleteItem(id, session);
    return noContent();
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/items/:id] DELETE error", err);
    return internalError(reqId);
  }
}
