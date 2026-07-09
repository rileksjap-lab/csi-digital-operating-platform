import { query } from "@/lib/db/pool";
import type {
  DepartmentRow,
  RoleRow,
  RequestTypeRow,
  TierRow,
} from "@/lib/types/db-rows";

export async function listDepartments(): Promise<DepartmentRow[]> {
  const result = await query<DepartmentRow>(
    `SELECT id AS "Id", deptcode AS "DeptCode", deptname AS "DeptName" FROM department ORDER BY deptcode`
  );
  return result.rows;
}

export async function listRoles(): Promise<RoleRow[]> {
  const result = await query<RoleRow>(
    `SELECT id AS "Id", rolecode AS "RoleCode", rolename AS "RoleName", capacityscope AS "CapacityScope" FROM role ORDER BY rolename`
  );
  return result.rows;
}

export async function listRequestTypes(): Promise<RequestTypeRow[]> {
  const result = await query<RequestTypeRow>(
    `SELECT id AS "Id", typecode AS "TypeCode", typename AS "TypeName", domain AS "Domain",
            slaackdays AS "SlaAckDays", slaclassifydays AS "SlaClassifyDays", slaroutedays AS "SlaRouteDays"
     FROM request_type ORDER BY typecode`
  );
  return result.rows;
}

export async function listComplexityTiers(): Promise<TierRow[]> {
  const result = await query<TierRow>(
    `SELECT id AS "Id", tiercode AS "TierCode", tiername AS "TierName", approverroleid AS "ApproverRoleId"
     FROM complexity_tier ORDER BY tiercode`
  );
  return result.rows;
}
