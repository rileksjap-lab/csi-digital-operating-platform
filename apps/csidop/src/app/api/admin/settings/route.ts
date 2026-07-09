import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, notFound, internalError } from "@/lib/response";
import { requireSystemConfig, settingPatchSchema } from "@/lib/validations/admin.schema";
import { listSettings, patchSetting } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const data = await listSettings();
    return ok(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/settings] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json();
    const { key, ...rest } = body;
    if (!key) return notFound("Setting key is required");

    const parsed = settingPatchSchema.safeParse(rest);
    if (!parsed.success) return zodError(parsed.error);

    const updated = await patchSetting(key, parsed.data.settingValue, session);
    if (!updated) return notFound("Setting not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/settings] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
