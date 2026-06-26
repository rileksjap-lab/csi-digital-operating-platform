import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import {
  listDepartments,
  listRoles,
  listRequestTypes,
  listComplexityTiers,
} from "@/lib/repositories/lookup.repo";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const [departments, roles, requestTypes, tiers] = await Promise.all([
      listDepartments(),
      listRoles(),
      listRequestTypes(),
      listComplexityTiers(),
    ]);
    return ok({ departments, roles, requestTypes, tiers });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[lookups] GET error", err);
    return internalError(reqId);
  }
}
