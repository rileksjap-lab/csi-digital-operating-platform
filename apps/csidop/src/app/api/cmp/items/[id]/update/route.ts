import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, notFound, zodError, internalError } from "@/lib/response";
import { cmpItemUpdateSchema } from "@/lib/validations/cmp.schema";
import { getItemById, getItemUpdate, upsertItemUpdate } from "@/lib/repositories/cmp.repo";

/** Progress state for one item (source: 02_PROGRESS_UPDATE, 1:1 with cmp_items). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const item = await getItemById(id);
    if (!item) return notFound("Item not found");
    const itemUpdate = await getItemUpdate(id);
    return ok(itemUpdate);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/items/:id/update] GET error", err);
    return internalError(reqId);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(
      session,
      "update_item_progress",
      "update_progress",
      "manage_workstream_items",
      "manage_hierarchy"
    );

    const { id } = await params;
    const body = await request.json();
    const parsed = cmpItemUpdateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const itemUpdate = await upsertItemUpdate(id, parsed.data, session);
    return ok(itemUpdate);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/items/:id/update] PUT error", err);
    return internalError(reqId);
  }
}
