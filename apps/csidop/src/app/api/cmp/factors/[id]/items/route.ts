import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, created, notFound, zodError, internalError } from "@/lib/response";
import { cmpItemCreateSchema } from "@/lib/validations/cmp.schema";
import { getFactorById, listItems, createItem } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const factor = await getFactorById(id);
    if (!factor) return notFound("Factor not found");
    const items = await listItems(id);
    return ok(items);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/factors/:id/items] GET error", err);
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
    const parsed = cmpItemCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const item = await createItem(id, parsed.data, session);
    return created(item);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/factors/:id/items] POST error", err);
    return internalError(reqId);
  }
}
