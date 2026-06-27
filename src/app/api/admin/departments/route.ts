import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, notFound, internalError, forbidden } from "@/lib/response";
import { requireSystemConfig, departmentCreateSchema, departmentPatchSchema } from "@/lib/validations/admin.schema";
import { listDepartments, createDepartment, patchDepartment, deleteDepartment } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    return ok(await listDepartments());
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/departments] GET error", err);
    return internalError("admin-departments-get");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const body = await request.json();
    const parsed = departmentCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const created = await createDepartment(parsed.data, session);
    return ok(created);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/departments] POST error", err);
    return internalError("admin-departments-post");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return notFound("Department ID required");
    const parsed = departmentPatchSchema.safeParse(rest);
    if (!parsed.success) return zodError(parsed.error);
    const updated = await patchDepartment(id, parsed.data, session);
    if (!updated) return notFound("Department not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/departments] PATCH error", err);
    return internalError("admin-departments-patch");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const { id } = await request.json();
    if (!id) return notFound("Department ID required");
    const deleted = await deleteDepartment(id, session);
    if (!deleted) return forbidden("Cannot delete department with assigned staff");
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/departments] DELETE error", err);
    return internalError("admin-departments-delete");
  }
}
