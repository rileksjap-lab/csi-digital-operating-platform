import type { NextRequest } from "next/server";
import { requireAuth, requireCmpCapability } from "@/lib/auth/guards";
import { ok, created, zodError, internalError } from "@/lib/response";
import { cmpPlanCreateSchema } from "@/lib/validations/cmp.schema";
import { listPlans, createPlan } from "@/lib/repositories/cmp.repo";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const plans = await listPlans();
    return ok(plans);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans] GET error", err);
    return internalError(reqId);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    await requireCmpCapability(session, "manage_hierarchy");

    const body = await request.json();
    const parsed = cmpPlanCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const plan = await createPlan(parsed.data, session);
    return created(plan);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/plans] POST error", err);
    return internalError(reqId);
  }
}
