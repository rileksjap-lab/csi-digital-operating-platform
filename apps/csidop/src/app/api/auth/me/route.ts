import type { NextRequest } from "next/server";
import { resolveSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { ok, unauthorized } from "@/lib/response";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie) return unauthorized();

  const session = await resolveSession(cookie.value);
  if (!session) return unauthorized("Session expired or revoked");

  return ok({
    staffId: session.staffId,
    staffCode: session.staffCode,
    name: session.displayName,
    email: session.email,
    roleCode: session.roleCode,
    roleName: session.roleName,
    role: session.role,
    deptCode: session.deptCode,
    departmentId: session.departmentId,
    subTeam: session.subTeam,
    capacityScope: session.capacityScope,
    systemConfigFlag: session.systemConfigFlag,
  });
}
