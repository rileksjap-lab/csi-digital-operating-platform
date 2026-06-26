import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, notFound, internalError } from "@/lib/response";
import { requireSystemConfig, multiplierFactorPatchSchema } from "@/lib/validations/admin.schema";
import { listMultiplierFactors, patchMultiplierFactor } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const data = await listMultiplierFactors();
    return ok(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/multiplier-factors] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return notFound("Multiplier factor ID is required");

    const parsed = multiplierFactorPatchSchema.safeParse(rest);
    if (!parsed.success) return zodError(parsed.error);

    const updated = await patchMultiplierFactor(id, parsed.data.multiplierValue, session);
    if (!updated) return notFound("Multiplier factor not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/multiplier-factors] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
