import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, notFound, badRequest, zodError, internalError } from "@/lib/response";
import { createUploadIntent } from "@/lib/repositories/evidence.repo";
import { evidenceUploadUrlSchema } from "@/lib/validations/wo.schema";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);

    const body = await request.json();
    const parsed = evidenceUploadUrlSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const scope = buildScopeFilter(session);
    const { result, error } = await createUploadIntent(parsed.data, session, scope);

    if (error === "NOT_FOUND") return notFound("Work order not found");
    if (error === "WO_CLOSED") return badRequest("Cannot upload evidence to a closed work order");
    if (!result) return notFound("Work order not found");

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[evidence/upload-url] POST error", err);
    return internalError(reqId);
  }
}
