import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, noContent, notFound, zodError, internalError } from "@/lib/response";
import { cmpWorkstreamPatchSchema } from "@/lib/validations/cmp.schema";
import { getWorkstreamById, updateWorkstream, deleteWorkstream } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const workstream = await getWorkstreamById(id);
    if (!workstream) return notFound("Workstream not found");
    return ok(workstream);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/workstreams/:id] GET error", err);
    return internalError(reqId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "manage_hierarchy", "manage_workstream_items");

    const { id } = await params;
    const body = await request.json();
    const parsed = cmpWorkstreamPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const workstream = await updateWorkstream(id, parsed.data, session);
    return ok(workstream);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/workstreams/:id] PATCH error", err);
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
    await deleteWorkstream(id, session);
    return noContent();
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/workstreams/:id] DELETE error", err);
    return internalError(reqId);
  }
}
