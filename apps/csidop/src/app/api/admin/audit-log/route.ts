import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { requireSystemConfig } from "@/lib/validations/admin.schema";
import { listAuditLog } from "@/lib/repositories/admin.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const sp = request.nextUrl.searchParams;
    const filters = {
      entityName: sp.get("entityName") ?? undefined,
      action: sp.get("action") ?? undefined,
      staffId: sp.get("staffId") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 50,
      offset: sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0,
    };

    const result = await listAuditLog(filters);
    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/audit-log] GET error", err);
    return internalError("admin-audit-log-get");
  }
}
