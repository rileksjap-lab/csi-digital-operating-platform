import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, created, notFound, zodError, internalError } from "@/lib/response";
import { cmpWorkstreamCreateSchema } from "@/lib/validations/cmp.schema";
import { getPlanById, listWorkstreams, createWorkstream } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const plan = await getPlanById(id);
    if (!plan) return notFound("Plan not found");
    const workstreams = await listWorkstreams(id);
    return ok(workstreams);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/workstreams] GET error", err);
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
    const parsed = cmpWorkstreamCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const workstream = await createWorkstream(id, parsed.data, session);
    return created(workstream);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id/workstreams] POST error", err);
    return internalError(reqId);
  }
}
