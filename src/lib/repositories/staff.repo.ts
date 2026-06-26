import { query } from "@/lib/db/pool";
import type { StaffWithRoleRow } from "@/lib/auth/session";

export async function findStaffByEmail(
  email: string
): Promise<StaffWithRoleRow | null> {
  const result = await query<StaffWithRoleRow>(
    `SELECT s.id AS "Id", s.staffcode AS "StaffCode", s.name AS "Name", s.email AS "Email",
            s.roleid AS "RoleId", r.rolecode AS "RoleCode", r.rolename AS "RoleName", r.capacityscope AS "CapacityScope",
            s.deptid AS "DeptId", d.deptcode AS "DeptCode", s.subteam AS "SubTeam", s.systemconfigflag AS "SystemConfigFlag"
     FROM staff s
     JOIN role r ON r.id = s.roleid
     JOIN department d ON d.id = s.deptid
     WHERE LOWER(s.email) = LOWER($1) AND s.status = 'Active'
     LIMIT 1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export interface StaffSummaryRow {
  Id: string;
  StaffCode: string;
  Name: string;
  SubTeam: string | null;
  RoleCode: string;
  DeptCode: string;
}

export async function listActiveStaff(
  deptId?: string
): Promise<StaffSummaryRow[]> {
  const result = await query<StaffSummaryRow>(
    `SELECT s.id AS "Id", s.staffcode AS "StaffCode", s.name AS "Name", s.subteam AS "SubTeam",
            r.rolecode AS "RoleCode", d.deptcode AS "DeptCode"
     FROM staff s
     JOIN role r ON r.id = s.roleid
     JOIN department d ON d.id = s.deptid
     WHERE s.status = 'Active'
       AND ($1::uuid IS NULL OR s.deptid = $1)
     ORDER BY s.name`,
    [deptId ?? null]
  );
  return result.rows;
}
