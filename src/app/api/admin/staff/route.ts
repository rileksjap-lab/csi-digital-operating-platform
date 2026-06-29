import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, notFound, badRequest, internalError } from "@/lib/response";
import { requireSystemConfig, staffListQuerySchema, staffPatchSchema, staffCreateSchema } from "@/lib/validations/admin.schema";
import { listStaffAdmin, patchStaff, createStaff } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = staffListQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const data = await listStaffAdmin(parsed.data);
    return ok(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/staff] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json();
    const parsed = staffCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const created = await createStaff(parsed.data, session);
    return ok(created);
  } catch (err) {
    if (err instanceof Response) return err;
    const pgErr = err as { code?: string; constraint?: string };
    if (pgErr.code === "23505") {
      if (pgErr.constraint?.includes("staffcode")) return badRequest("Staff code already exists");
      if (pgErr.constraint?.includes("email")) return badRequest("Email already exists");
      return badRequest("Duplicate entry");
    }
    console.error("[admin/staff] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json();
    const { staffId, ...rest } = body;
    if (!staffId) return notFound("Staff ID is required");

    const parsed = staffPatchSchema.safeParse(rest);
    if (!parsed.success) return zodError(parsed.error);

    const updated = await patchStaff(staffId, parsed.data, session);
    if (!updated) return notFound("Staff member not found");
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/staff] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
