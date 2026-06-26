import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { listActiveStaff } from "@/lib/repositories/staff.repo";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const deptId = request.nextUrl.searchParams.get("deptId") ?? undefined;
    const staff = await listActiveStaff(deptId);
    return ok(staff);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[staff] GET error", err);
    return internalError(reqId);
  }
}
