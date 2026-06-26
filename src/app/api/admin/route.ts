import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { requireSystemConfig } from "@/lib/validations/admin.schema";
import {
  listRequestTypes,
  listComplexityTiers,
  listMultiplierFactors,
  listRoleSplits,
  listSettings,
  listBaselineTiers,
} from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const [requestTypes, complexityTiers, multiplierFactors, roleSplits, settings, baselineTiers] =
      await Promise.all([
        listRequestTypes(),
        listComplexityTiers(),
        listMultiplierFactors(),
        listRoleSplits(),
        listSettings(),
        listBaselineTiers(),
      ]);

    return ok({ requestTypes, complexityTiers, multiplierFactors, roleSplits, settings, baselineTiers });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
