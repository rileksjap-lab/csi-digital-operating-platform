import type { NextRequest } from "next/server";
import { getSession } from "@/lib/redis";
import { unauthorized, forbidden } from "@/lib/response";
import { verifySessionJwt } from "@/lib/auth/jwt";
import { query } from "@/lib/db/pool";
import { ROLE_CODE_MAP } from "@/lib/auth/session";
import type { AuthSession, Role, CapacityScope } from "@/lib/types/api";

export interface ScopeFilter {
  scope: CapacityScope;
  staffId: string;
  departmentId: string;
  subTeam: string | null;
}

export async function requireAuth(request: NextRequest): Promise<AuthSession> {
  let sessionId = request.headers.get("x-session-id");

  if (!sessionId) {
    const cookie = request.cookies.get("csidop_session")?.value;
    if (!cookie) throw unauthorized();
    const payload = await verifySessionJwt(cookie);
    if (!payload?.sid) throw unauthorized();
    sessionId = payload.sid;
  }

  const session = await getSession(sessionId);
  if (!session) throw unauthorized("Session expired or revoked");

  return session;
}

/**
 * Like requireAuth, for the KPI module. Some people hold a higher system role
 * only for access (for example a Pre-Sales Executive who coordinates work orders
 * as a Team Lead). The KPI appraisal follows their real job, so when a KPI role
 * is set it replaces the role everywhere in the KPI module: their form, their
 * reviewer chain and who may set up, finalise or send to HR. It is read from the
 * database on each call, so changing it needs no new login.
 */
export async function requireKpiAuth(request: NextRequest): Promise<AuthSession> {
  const session = await requireAuth(request);
  const res = await query<{ rolecode: string | null }>(
    `SELECT kr.rolecode FROM staff s LEFT JOIN role kr ON kr.id = s.kpiroleid WHERE s.id = $1`,
    [session.staffId]
  );
  const code = res.rows[0]?.rolecode;
  if (!code) return session;
  return { ...session, roleCode: code, role: ROLE_CODE_MAP[code] ?? "TeamMember" };
}

export function requireRole(
  session: AuthSession,
  ...allowed: Role[]
): void {
  if (!allowed.includes(session.role)) {
    throw forbidden(
      `Role '${session.role}' is not permitted for this action`
    );
  }
}

export function buildScopeFilter(session: AuthSession): ScopeFilter {
  return {
    scope: session.capacityScope,
    staffId: session.staffId,
    departmentId: session.departmentId,
    subTeam: session.subTeam,
  };
}
