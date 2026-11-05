import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, notFound, zodError, internalError } from "@/lib/response";
import { cmpPlanPatchSchema } from "@/lib/validations/cmp.schema";
import { getPlanById, updatePlan } from "@/lib/repositories/cmp.repo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const plan = await getPlanById(id);
    if (!plan) return notFound("Plan not found");
    return ok(plan);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id] GET error", err);
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
    const parsed = cmpPlanPatchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const plan = await updatePlan(id, parsed.data, session);
    return ok(plan);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans/:id] PATCH error", err);
    return internalError(reqId);
  }
}
