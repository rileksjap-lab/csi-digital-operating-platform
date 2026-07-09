import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { requireSystemConfig, roleSplitPutSchema } from "@/lib/validations/admin.schema";
import { listRoleSplits, putRoleSplit } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);
    const data = await listRoleSplits();
    return ok(data);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/role-split] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json();
    const parsed = roleSplitPutSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { deptId, roleSplits } = parsed.data;
    const updated = await putRoleSplit(deptId, roleSplits, session);
    return ok(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/role-split] PUT error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
