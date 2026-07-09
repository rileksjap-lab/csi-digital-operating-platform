import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, notFound, internalError, forbidden } from "@/lib/response";
import { requireSystemConfig, roleCreateSchema, rolePatchSchema } from "@/lib/validations/admin.schema";
import { listRoles, createRole, patchRole, deleteRole } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    return ok(await listRoles());
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/roles] GET error", err);
    return internalError("admin-roles-get");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const body = await request.json();
    const parsed = roleCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const created = await createRole(parsed.data, session);
    return ok(created);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/roles] POST error", err);
    return internalError("admin-roles-post");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return notFound("Role ID required");
    const parsed = rolePatchSchema.safeParse(rest);
    if (!parsed.success) return zodError(parsed.error);
    const updated = await patchRole(id, parsed.data, session);
    if (!updated) return notFound("Role not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/roles] PATCH error", err);
    return internalError("admin-roles-patch");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const { id } = await request.json();
    if (!id) return notFound("Role ID required");
    const deleted = await deleteRole(id, session);
    if (!deleted) return forbidden("Cannot delete role with assigned staff");
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/roles] DELETE error", err);
    return internalError("admin-roles-delete");
  }
}
