import { query } from "@/lib/db/pool";
import type { StaffWithRoleRow } from "@/lib/auth/session";

const DEV_EMAIL = "dev@csidop.local";

export function isDevMode(): boolean {
  return (
    process.env.NODE_ENV === "development" && !process.env.OIDC_CLIENT_ID
  );
}

export async function getDevStaffRow(): Promise<StaffWithRoleRow> {
  const result = await query<StaffWithRoleRow>(
    `SELECT s.id AS "Id", s.staffcode AS "StaffCode", s.name AS "Name", s.email AS "Email",
            s.roleid AS "RoleId", r.rolecode AS "RoleCode", r.rolename AS "RoleName", r.capacityscope AS "CapacityScope",
            s.deptid AS "DeptId", d.deptcode AS "DeptCode", s.subteam AS "SubTeam", s.systemconfigflag AS "SystemConfigFlag"
     FROM staff s
     JOIN role r ON r.id = s.roleid
     JOIN department d ON d.id = s.deptid
     WHERE LOWER(s.email) = LOWER($1) AND s.status = 'Active'
     LIMIT 1`,
    [DEV_EMAIL]
  );

  if (result.rows.length === 0) {
    throw new Error(
      `Dev staff row not found for ${DEV_EMAIL}. Run migrations/seed/002_seed_dev_staff.sql first.`
    );
  }

  return result.rows[0];
}
