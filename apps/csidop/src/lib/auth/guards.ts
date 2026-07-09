import type { NextRequest } from "next/server";
import { getSession } from "@/lib/redis";
import { unauthorized, forbidden } from "@/lib/response";
import { verifySessionJwt } from "@/lib/auth/jwt";
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
