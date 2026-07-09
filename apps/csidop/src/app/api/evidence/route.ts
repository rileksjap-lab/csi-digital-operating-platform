import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { listEvidence } from "@/lib/repositories/evidence.repo";
import { evidenceListQuerySchema } from "@/lib/validations/wo.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);

    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = evidenceListQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const items = await listEvidence(parsed.data.woId, parsed.data.evidenceType, scope);
    return ok(items);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[evidence] GET error", err);
    return internalError(reqId);
  }
}
