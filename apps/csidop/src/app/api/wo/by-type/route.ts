import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { woListQuerySchema } from "@/lib/validations/wo.schema";
import { getWoTypeCounts } from "@/lib/repositories/wo.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const parsed = woListQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const counts = await getWoTypeCounts(parsed.data, scope);

    return ok(counts);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[wo/by-type] GET error", err);
    return internalError(reqId);
  }
}
