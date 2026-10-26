import type { NextRequest } from "next/server";
import { resolveSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { ok, unauthorized } from "@/lib/response";
import { query } from "@/lib/db/pool";
import { ROLE_CODE_MAP } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie) return unauthorized();

  const session = await resolveSession(cookie.value);
  if (!session) return unauthorized("Session expired or revoked");

  // The KPI module follows the KPI role when one is set (see requireKpiAuth).
  const kr = await query<{ rolecode: string | null }>(
    `SELECT kr.rolecode FROM staff s LEFT JOIN role kr ON kr.id = s.kpiroleid WHERE s.id = $1`, [session.staffId]);
  const kpiRole = (kr.rows[0]?.rolecode && ROLE_CODE_MAP[kr.rows[0].rolecode]) || session.role;

  return ok({
    kpiRole,
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
