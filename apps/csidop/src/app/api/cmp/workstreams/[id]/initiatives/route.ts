import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, created, notFound, zodError, internalError } from "@/lib/response";
import { cmpInitiativeCreateSchema } from "@/lib/validations/cmp.schema";
import { getWorkstreamById, listInitiatives, createInitiative } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const workstream = await getWorkstreamById(id);
    if (!workstream) return notFound("Workstream not found");
    const initiatives = await listInitiatives(id);
    return ok(initiatives);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/workstreams/:id/initiatives] GET error", err);
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
    const parsed = cmpInitiativeCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const initiative = await createInitiative(id, parsed.data, session);
    return created(initiative);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/workstreams/:id/initiatives] POST error", err);
    return internalError(reqId);
  }
}
