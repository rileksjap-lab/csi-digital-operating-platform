import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, notFound, internalError } from "@/lib/response";
import { requireSystemConfig, requestTypePatchSchema } from "@/lib/validations/admin.schema";
import { listRequestTypes, patchRequestType } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const data = await listRequestTypes();
    return ok(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/request-types] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return notFound("Request type ID is required");

    const parsed = requestTypePatchSchema.safeParse(rest);
    if (!parsed.success) return zodError(parsed.error);

    const updated = await patchRequestType(id, parsed.data, session);
    if (!updated) return notFound("Request type not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/request-types] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
