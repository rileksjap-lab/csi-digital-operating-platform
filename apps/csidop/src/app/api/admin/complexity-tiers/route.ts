import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, notFound, internalError } from "@/lib/response";
import { requireSystemConfig, complexityTierPatchSchema } from "@/lib/validations/admin.schema";
import { listComplexityTiers, patchComplexityTier } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const data = await listComplexityTiers();
    return ok(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/complexity-tiers] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return notFound("Complexity tier ID is required");

    const parsed = complexityTierPatchSchema.safeParse(rest);
    if (!parsed.success) return zodError(parsed.error);

    const updated = await patchComplexityTier(id, parsed.data, session);
    if (!updated) return notFound("Complexity tier not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/complexity-tiers] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
