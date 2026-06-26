import { signSessionJwt, verifySessionJwt } from "@/lib/auth/jwt";
import { setSession, getSession, deleteSession } from "@/lib/redis";
import type { AuthSession, Role, CapacityScope } from "@/lib/types/api";

export const SESSION_COOKIE_NAME = "csidop_session";
const SESSION_TTL_SEC = 28800; // 8 hours

export interface StaffWithRoleRow {
  Id: string;
  StaffCode: string;
  Name: string;
  Email: string;
  RoleId: string;
  RoleCode: string;
  RoleName: string;
  CapacityScope: string;
  DeptId: string;
  DeptCode: string;
  SubTeam: string | null;
  SystemConfigFlag: boolean;
}

const ROLE_CODE_MAP: Record<string, Role> = {
  HOD: "HOD",
  SM: "SolutionManager",
  TL: "TeamLead",
  TM: "TeamMember",
  BIM_TL: "BIMTeamLead",
  BIM_MOD: "BIMModeler",
};

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.DISABLE_SECURE_COOKIE !== "true",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL_SEC,
  };
}

export async function createSessionFromStaff(
  staff: StaffWithRoleRow
): Promise<{ cookieValue: string; session: AuthSession }> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_SEC * 1000
  ).toISOString();

  const session: AuthSession = {
    staffId: staff.Id,
    staffCode: staff.StaffCode,
    email: staff.Email,
    displayName: staff.Name,
    roleId: staff.RoleId,
    roleCode: staff.RoleCode,
    role: ROLE_CODE_MAP[staff.RoleCode] ?? "TeamMember",
    roleName: staff.RoleName,
    departmentId: staff.DeptId,
    deptCode: staff.DeptCode,
    subTeam: staff.SubTeam,
    capacityScope: staff.CapacityScope as CapacityScope,
    systemConfigFlag: staff.SystemConfigFlag,
    expiresAt,
  };

  await setSession(sessionId, session, SESSION_TTL_SEC);
  const cookieValue = await signSessionJwt(sessionId);

  return { cookieValue, session };
}

export async function resolveSession(
  cookieValue: string
): Promise<AuthSession | null> {
  const payload = await verifySessionJwt(cookieValue);
  if (!payload) return null;
  return getSession(payload.sid);
}

export async function destroySession(cookieValue: string): Promise<void> {
  const payload = await verifySessionJwt(cookieValue);
  if (payload) {
    await deleteSession(payload.sid);
  }
}
