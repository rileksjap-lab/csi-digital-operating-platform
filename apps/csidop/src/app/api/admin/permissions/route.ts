import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { requireSystemConfig, permissionPutSchema } from "@/lib/validations/admin.schema";
import { listRolePermissions, putRolePermissions } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    return ok(await listRolePermissions());
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/permissions] GET error", err);
    return internalError("admin-permissions-get");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const body = await request.json();
    const parsed = permissionPutSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    await putRolePermissions(parsed.data.roleId, parsed.data.permissions, session);
    return ok(await listRolePermissions());
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/permissions] PUT error", err);
    return internalError("admin-permissions-put");
  }
}
