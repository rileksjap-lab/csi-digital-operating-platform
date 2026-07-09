import pool, { query } from "@/lib/db/pool";
import type { AuthSession } from "@/lib/types/api";
import { insertAuditEntry } from "@/lib/db/audit";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RequestTypeRow {
  id: string;
  typeCode: number;
  typeName: string;
  domain: string;
  slaAckDays: number;
  slaClassifyDays: number;
  slaRouteDays: number;
}

export interface ComplexityTierRow {
  id: string;
  tierCode: number;
  tierName: string;
  approverRoleId: string;
  approverRoleName: string;
}

export interface MultiplierFactorRow {
  id: string;
  factorCode: string;
  multiplierValue: number;
}

export interface RoleSplitRow {
  id: string;
  deptId: string;
  deptCode: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  percentage: number;
}

export interface SystemSettingRow {
  id: string;
  settingKey: string;
  settingValue: string;
  description: string | null;
}

export interface StaffAdminRow {
  id: string;
  staffCode: string;
  name: string;
  email: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  deptId: string;
  deptCode: string;
  deptName: string;
  subTeam: string | null;
  productivityFactor: number;
  dailyUsableHours: number;
  status: string;
  systemConfigFlag: boolean;
}

export interface BaselineTierRow {
  id: string;
  tierSize: string;
  baselineCSIHours: number;
  baselineCMTHours: number;
}

// ─── Request types ──────────────────────────────────────────────────────────

export async function listRequestTypes(): Promise<RequestTypeRow[]> {
  const { rows } = await query<RequestTypeRow>(
    `SELECT id AS "id", typecode AS "typeCode", typename AS "typeName",
            domain AS "domain", slaackdays AS "slaAckDays",
            slaclassifydays AS "slaClassifyDays", slaroutedays AS "slaRouteDays"
     FROM request_type ORDER BY typecode`
  );
  return rows;
}

export async function patchRequestType(
  id: string,
  input: { typeName?: string; slaAckDays?: number; slaClassifyDays?: number; slaRouteDays?: number },
  session: AuthSession
): Promise<RequestTypeRow | null> {
  const sets: string[] = ["updatedat = now()"];
  const params: unknown[] = [];
  if (input.typeName) { params.push(input.typeName); sets.push(`typename = $${params.length}`); }
  if (input.slaAckDays) { params.push(input.slaAckDays); sets.push(`slaackdays = $${params.length}`); }
  if (input.slaClassifyDays) { params.push(input.slaClassifyDays); sets.push(`slaclassifydays = $${params.length}`); }
  if (input.slaRouteDays) { params.push(input.slaRouteDays); sets.push(`slaroutedays = $${params.length}`); }
  if (params.length === 0) return null;

  params.push(id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE request_type SET ${sets.join(", ")} WHERE id = $${params.length}`, params
    );
    if (!rowCount) { await client.query("ROLLBACK"); return null; }
    await insertAuditEntry({ entityName: "REQUEST_TYPE", entityId: id, action: "Update", newValue: JSON.stringify(input), performedBy: session.staffId }, client);
    await client.query("COMMIT");
    const { rows } = await query<RequestTypeRow>(
      `SELECT id AS "id", typecode AS "typeCode", typename AS "typeName", domain AS "domain",
              slaackdays AS "slaAckDays", slaclassifydays AS "slaClassifyDays", slaroutedays AS "slaRouteDays"
       FROM request_type WHERE id = $1`, [id]
    );
    return rows[0] ?? null;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── Complexity tiers ───────────────────────────────────────────────────────

export async function listComplexityTiers(): Promise<ComplexityTierRow[]> {
  const { rows } = await query<ComplexityTierRow>(
    `SELECT ct.id AS "id", ct.tiercode AS "tierCode", ct.tiername AS "tierName",
            ct.approverroleid AS "approverRoleId", r.rolename AS "approverRoleName"
     FROM complexity_tier ct JOIN role r ON r.id = ct.approverroleid
     ORDER BY ct.tiercode`
  );
  return rows;
}

export async function patchComplexityTier(
  id: string,
  input: { tierName?: string; approverRoleId?: string },
  session: AuthSession
): Promise<ComplexityTierRow | null> {
  const sets: string[] = ["updatedat = now()"];
  const params: unknown[] = [];
  if (input.tierName) { params.push(input.tierName); sets.push(`tiername = $${params.length}`); }
  if (input.approverRoleId) { params.push(input.approverRoleId); sets.push(`approverroleid = $${params.length}`); }
  if (params.length === 0) return null;

  params.push(id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE complexity_tier SET ${sets.join(", ")} WHERE id = $${params.length}`, params
    );
    if (!rowCount) { await client.query("ROLLBACK"); return null; }
    await insertAuditEntry({ entityName: "COMPLEXITY_TIER", entityId: id, action: "Update", newValue: JSON.stringify(input), performedBy: session.staffId }, client);
    await client.query("COMMIT");
    const { rows } = await query<ComplexityTierRow>(
      `SELECT ct.id AS "id", ct.tiercode AS "tierCode", ct.tiername AS "tierName",
              ct.approverroleid AS "approverRoleId", r.rolename AS "approverRoleName"
       FROM complexity_tier ct JOIN role r ON r.id = ct.approverroleid
       WHERE ct.id = $1`, [id]
    );
    return rows[0] ?? null;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── Multiplier factors ─────────────────────────────────────────────────────

export async function listMultiplierFactors(): Promise<MultiplierFactorRow[]> {
  const { rows } = await query<MultiplierFactorRow>(
    `SELECT id AS "id", factorcode AS "factorCode",
            multipliervalue::float AS "multiplierValue"
     FROM multiplier_factor ORDER BY factorcode`
  );
  return rows;
}

export async function patchMultiplierFactor(
  id: string,
  multiplierValue: number,
  session: AuthSession
): Promise<MultiplierFactorRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE multiplier_factor SET multipliervalue = $1, updatedat = now() WHERE id = $2`,
      [multiplierValue, id]
    );
    if (!rowCount) { await client.query("ROLLBACK"); return null; }
    await insertAuditEntry({ entityName: "MULTIPLIER_FACTOR", entityId: id, action: "Update", newValue: JSON.stringify({ multiplierValue }), performedBy: session.staffId }, client);
    await client.query("COMMIT");
    const { rows } = await query<MultiplierFactorRow>(
      `SELECT id AS "id", factorcode AS "factorCode", multipliervalue::float AS "multiplierValue"
       FROM multiplier_factor WHERE id = $1`, [id]
    );
    return rows[0] ?? null;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── Role split ─────────────────────────────────────────────────────────────

export async function listRoleSplits(): Promise<RoleSplitRow[]> {
  const { rows } = await query<RoleSplitRow>(
    `SELECT rs.id AS "id", rs.deptid AS "deptId", d.deptcode AS "deptCode",
            rs.roleid AS "roleId", r.rolecode AS "roleCode", r.rolename AS "roleName",
            rs.percentage::float AS "percentage"
     FROM role_split rs
     JOIN department d ON d.id = rs.deptid
     JOIN role r ON r.id = rs.roleid
     ORDER BY d.deptcode, r.rolecode`
  );
  return rows;
}

export async function putRoleSplit(
  deptId: string,
  roleSplits: { roleId: string; percentage: number }[],
  session: AuthSession
): Promise<RoleSplitRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const rs of roleSplits) {
      const { rowCount } = await client.query(
        `UPDATE role_split SET percentage = $1, updatedat = now()
         WHERE deptid = $2 AND roleid = $3`,
        [rs.percentage, deptId, rs.roleId]
      );
      if (!rowCount) {
        await client.query(
          `INSERT INTO role_split (deptid, roleid, percentage) VALUES ($1, $2, $3)`,
          [deptId, rs.roleId, rs.percentage]
        );
      }
    }

    await insertAuditEntry({
      entityName: "ROLE_SPLIT",
      entityId: deptId,
      action: "Update",
      newValue: JSON.stringify(roleSplits),
      performedBy: session.staffId,
    }, client);

    await client.query("COMMIT");

    const { rows } = await query<RoleSplitRow>(
      `SELECT rs.id AS "id", rs.deptid AS "deptId", d.deptcode AS "deptCode",
              rs.roleid AS "roleId", r.rolecode AS "roleCode", r.rolename AS "roleName",
              rs.percentage::float AS "percentage"
       FROM role_split rs
       JOIN department d ON d.id = rs.deptid
       JOIN role r ON r.id = rs.roleid
       WHERE rs.deptid = $1
       ORDER BY r.rolecode`,
      [deptId]
    );
    return rows;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── System settings ────────────────────────────────────────────────────────

export async function listSettings(): Promise<SystemSettingRow[]> {
  const { rows } = await query<SystemSettingRow>(
    `SELECT id AS "id", settingkey AS "settingKey",
            settingvalue AS "settingValue", description AS "description"
     FROM system_setting ORDER BY settingkey`
  );
  return rows;
}

export async function patchSetting(
  key: string,
  settingValue: string,
  session: AuthSession
): Promise<SystemSettingRow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const old = await client.query<{ id: string; settingvalue: string }>(
      `SELECT id, settingvalue FROM system_setting WHERE settingkey = $1`, [key]
    );
    if (old.rows.length === 0) { await client.query("ROLLBACK"); return null; }

    await client.query(
      `UPDATE system_setting SET settingvalue = $1, updatedat = now() WHERE settingkey = $2`,
      [settingValue, key]
    );
    await insertAuditEntry({
      entityName: "SYSTEM_SETTING",
      entityId: old.rows[0].id,
      action: "Update",
      fieldName: "SettingValue",
      oldValue: old.rows[0].settingvalue,
      newValue: settingValue,
      performedBy: session.staffId,
    }, client);
    await client.query("COMMIT");

    const { rows } = await query<SystemSettingRow>(
      `SELECT id AS "id", settingkey AS "settingKey",
              settingvalue AS "settingValue", description AS "description"
       FROM system_setting WHERE settingkey = $1`, [key]
    );
    return rows[0] ?? null;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── Staff management ───────────────────────────────────────────────────────

export async function listStaffAdmin(
  filters: { status?: string; deptId?: string }
): Promise<StaffAdminRow[]> {
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`s.status = $${params.length}`);
  } else {
    conditions.push(`s.status = 'Active'`);
  }
  if (filters.deptId) {
    params.push(filters.deptId);
    conditions.push(`s.deptid = $${params.length}`);
  }

  const { rows } = await query<StaffAdminRow>(
    `SELECT s.id AS "id", s.staffcode AS "staffCode", s.name AS "name",
            s.email AS "email", s.roleid AS "roleId", r.rolecode AS "roleCode",
            r.rolename AS "roleName", s.deptid AS "deptId", d.deptcode AS "deptCode",
            d.deptname AS "deptName", s.subteam AS "subTeam",
            s.productivityfactor::float AS "productivityFactor",
            s.dailyusablehours::float AS "dailyUsableHours",
            s.status AS "status", s.systemconfigflag AS "systemConfigFlag"
     FROM staff s
     JOIN role r ON r.id = s.roleid
     JOIN department d ON d.id = s.deptid
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.name`,
    params
  );
  return rows;
}

export async function patchStaff(
  staffId: string,
  input: {
    name?: string;
    email?: string;
    roleId?: string;
    deptId?: string;
    subTeam?: string | null;
    productivityFactor?: number;
    status?: string;
    systemConfigFlag?: boolean;
  },
  session: AuthSession
): Promise<StaffAdminRow | null> {
  const sets: string[] = ["updatedat = now()"];
  const params: unknown[] = [];

  if (input.name) { params.push(input.name); sets.push(`name = $${params.length}`); }
  if (input.email) { params.push(input.email); sets.push(`email = $${params.length}`); }
  if (input.roleId) { params.push(input.roleId); sets.push(`roleid = $${params.length}`); }
  if (input.deptId) { params.push(input.deptId); sets.push(`deptid = $${params.length}`); }
  if (input.subTeam !== undefined) { params.push(input.subTeam); sets.push(`subteam = $${params.length}`); }
  if (input.productivityFactor !== undefined) {
    params.push(input.productivityFactor);
    sets.push(`productivityfactor = $${params.length}`);
    const hours = 8 * input.productivityFactor;
    params.push(hours);
    sets.push(`dailyusablehours = $${params.length}`);
  }
  if (input.status) { params.push(input.status); sets.push(`status = $${params.length}`); }
  if (input.systemConfigFlag !== undefined) { params.push(input.systemConfigFlag); sets.push(`systemconfigflag = $${params.length}`); }

  if (params.length === 0) return null;

  params.push(staffId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE staff SET ${sets.join(", ")} WHERE id = $${params.length}`, params
    );
    if (!rowCount) { await client.query("ROLLBACK"); return null; }
    await insertAuditEntry({ entityName: "STAFF", entityId: staffId, action: "Update", newValue: JSON.stringify(input), performedBy: session.staffId }, client);
    await client.query("COMMIT");

    const { rows } = await query<StaffAdminRow>(
      `SELECT s.id AS "id", s.staffcode AS "staffCode", s.name AS "name",
              s.email AS "email", s.roleid AS "roleId", r.rolecode AS "roleCode",
              r.rolename AS "roleName", s.deptid AS "deptId", d.deptcode AS "deptCode",
              d.deptname AS "deptName", s.subteam AS "subTeam",
              s.productivityfactor::float AS "productivityFactor",
              s.dailyusablehours::float AS "dailyUsableHours",
              s.status AS "status", s.systemconfigflag AS "systemConfigFlag"
       FROM staff s JOIN role r ON r.id = s.roleid JOIN department d ON d.id = s.deptid
       WHERE s.id = $1`, [staffId]
    );
    return rows[0] ?? null;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

export async function createStaff(
  input: {
    staffCode: string;
    name: string;
    email: string;
    roleId: string;
    deptId: string;
    subTeam?: string | null;
    productivityFactor?: number;
  },
  session: AuthSession
): Promise<StaffAdminRow> {
  const pf = input.productivityFactor ?? 0.8;
  const dailyHours = 8 * pf;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO staff (staffcode, name, email, roleid, deptid, subteam, productivityfactor, dailyusablehours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [input.staffCode, input.name, input.email, input.roleId, input.deptId, input.subTeam ?? null, pf, dailyHours]
    );
    const staffId = rows[0].id;
    await insertAuditEntry(
      { entityName: "STAFF", entityId: staffId, action: "Insert", newValue: JSON.stringify(input), performedBy: session.staffId },
      client
    );
    await client.query("COMMIT");

    const result = await query<StaffAdminRow>(
      `SELECT s.id AS "id", s.staffcode AS "staffCode", s.name AS "name",
              s.email AS "email", s.roleid AS "roleId", r.rolecode AS "roleCode",
              r.rolename AS "roleName", s.deptid AS "deptId", d.deptcode AS "deptCode",
              d.deptname AS "deptName", s.subteam AS "subTeam",
              s.productivityfactor::float AS "productivityFactor",
              s.dailyusablehours::float AS "dailyUsableHours",
              s.status AS "status", s.systemconfigflag AS "systemConfigFlag"
       FROM staff s JOIN role r ON r.id = s.roleid JOIN department d ON d.id = s.deptid
       WHERE s.id = $1`, [staffId]
    );
    return result.rows[0];
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── Baseline tiers ─────────────────────────────────────────────────────────

export async function listBaselineTiers(): Promise<BaselineTierRow[]> {
  const { rows } = await query<BaselineTierRow>(
    `SELECT id AS "id", tiersize AS "tierSize",
            baselinecsihours::float AS "baselineCSIHours",
            baselinecmthours::float AS "baselineCMTHours"
     FROM baseline_tier ORDER BY baselinecsihours`
  );
  return rows;
}

// ─── Roles CRUD ────────────────────────────────────────────────────────────

export interface RoleRow {
  id: string;
  roleCode: string;
  roleName: string;
  capacityScope: string;
  staffCount: number;
}

export async function listRoles(): Promise<RoleRow[]> {
  const { rows } = await query<RoleRow>(
    `SELECT r.id AS "id", r.rolecode AS "roleCode", r.rolename AS "roleName",
            r.capacityscope AS "capacityScope",
            COUNT(s.id)::int AS "staffCount"
     FROM role r
     LEFT JOIN staff s ON s.roleid = r.id AND s.status = 'Active'
     GROUP BY r.id, r.rolecode, r.rolename, r.capacityscope
     ORDER BY r.rolecode`
  );
  return rows;
}

export async function createRole(
  input: { roleCode: string; roleName: string; capacityScope?: string },
  session: AuthSession
): Promise<RoleRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO role (rolecode, rolename, capacityscope) VALUES ($1, $2, $3) RETURNING id`,
      [input.roleCode, input.roleName, input.capacityScope ?? "Self"]
    );
    const roleId = rows[0].id;
    await insertAuditEntry({ entityName: "ROLE", entityId: roleId, action: "Insert", newValue: JSON.stringify(input), performedBy: session.staffId }, client);
    await client.query("COMMIT");
    return { id: roleId, roleCode: input.roleCode, roleName: input.roleName, capacityScope: input.capacityScope ?? "Self", staffCount: 0 };
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

export async function patchRole(
  id: string,
  input: { roleName?: string; capacityScope?: string },
  session: AuthSession
): Promise<RoleRow | null> {
  const sets: string[] = ["updatedat = now()"];
  const params: unknown[] = [];
  if (input.roleName) { params.push(input.roleName); sets.push(`rolename = $${params.length}`); }
  if (input.capacityScope) { params.push(input.capacityScope); sets.push(`capacityscope = $${params.length}`); }
  if (params.length === 0) return null;
  params.push(id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`UPDATE role SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
    if (!rowCount) { await client.query("ROLLBACK"); return null; }
    await insertAuditEntry({ entityName: "ROLE", entityId: id, action: "Update", newValue: JSON.stringify(input), performedBy: session.staffId }, client);
    await client.query("COMMIT");
    const result = await listRoles();
    return result.find((r) => r.id === id) ?? null;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

export async function deleteRole(id: string, session: AuthSession): Promise<boolean> {
  const check = await query<{ cnt: string }>(`SELECT COUNT(*) AS "cnt" FROM staff WHERE roleid = $1`, [id]);
  if (parseInt(check.rows[0].cnt, 10) > 0) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`DELETE FROM role WHERE id = $1`, [id]);
    if (!rowCount) { await client.query("ROLLBACK"); return false; }
    await insertAuditEntry({ entityName: "ROLE", entityId: id, action: "Delete", performedBy: session.staffId }, client);
    await client.query("COMMIT");
    return true;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── Departments CRUD ──────────────────────────────────────────────────────

export interface DepartmentRow {
  id: string;
  deptCode: string;
  deptName: string;
  staffCount: number;
}

export async function listDepartments(): Promise<DepartmentRow[]> {
  const { rows } = await query<DepartmentRow>(
    `SELECT d.id AS "id", d.deptcode AS "deptCode", d.deptname AS "deptName",
            COUNT(s.id)::int AS "staffCount"
     FROM department d
     LEFT JOIN staff s ON s.deptid = d.id AND s.status = 'Active'
     GROUP BY d.id, d.deptcode, d.deptname
     ORDER BY d.deptcode`
  );
  return rows;
}

export async function createDepartment(
  input: { deptCode: string; deptName: string },
  session: AuthSession
): Promise<DepartmentRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO department (deptcode, deptname) VALUES ($1, $2) RETURNING id`,
      [input.deptCode, input.deptName]
    );
    const deptId = rows[0].id;
    await insertAuditEntry({ entityName: "DEPARTMENT", entityId: deptId, action: "Insert", newValue: JSON.stringify(input), performedBy: session.staffId }, client);
    await client.query("COMMIT");
    return { id: deptId, deptCode: input.deptCode, deptName: input.deptName, staffCount: 0 };
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

export async function patchDepartment(
  id: string,
  input: { deptName?: string },
  session: AuthSession
): Promise<DepartmentRow | null> {
  if (!input.deptName) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`UPDATE department SET deptname = $1, updatedat = now() WHERE id = $2`, [input.deptName, id]);
    if (!rowCount) { await client.query("ROLLBACK"); return null; }
    await insertAuditEntry({ entityName: "DEPARTMENT", entityId: id, action: "Update", newValue: JSON.stringify(input), performedBy: session.staffId }, client);
    await client.query("COMMIT");
    const result = await listDepartments();
    return result.find((d) => d.id === id) ?? null;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

export async function deleteDepartment(id: string, session: AuthSession): Promise<boolean> {
  const check = await query<{ cnt: string }>(`SELECT COUNT(*) AS "cnt" FROM staff WHERE deptid = $1`, [id]);
  if (parseInt(check.rows[0].cnt, 10) > 0) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`DELETE FROM department WHERE id = $1`, [id]);
    if (!rowCount) { await client.query("ROLLBACK"); return false; }
    await insertAuditEntry({ entityName: "DEPARTMENT", entityId: id, action: "Delete", performedBy: session.staffId }, client);
    await client.query("COMMIT");
    return true;
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── Role Permissions ──────────────────────────────────────────────────────

export interface RolePermissionRow {
  roleId: string;
  roleCode: string;
  roleName: string;
  moduleCode: string;
  accessLevel: string;
}

export async function listRolePermissions(): Promise<RolePermissionRow[]> {
  const { rows } = await query<RolePermissionRow>(
    `SELECT rp.roleid AS "roleId", r.rolecode AS "roleCode", r.rolename AS "roleName",
            rp.modulecode AS "moduleCode", rp.accesslevel AS "accessLevel"
     FROM role_permission rp
     JOIN role r ON r.id = rp.roleid
     ORDER BY r.rolecode, rp.modulecode`
  );
  return rows;
}

export async function putRolePermissions(
  roleId: string,
  permissions: { moduleCode: string; accessLevel: string }[],
  session: AuthSession
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of permissions) {
      await client.query(
        `INSERT INTO role_permission (roleid, modulecode, accesslevel)
         VALUES ($1, $2, $3)
         ON CONFLICT (roleid, modulecode)
         DO UPDATE SET accesslevel = $3, updatedat = now()`,
        [roleId, p.moduleCode, p.accessLevel]
      );
    }
    await insertAuditEntry({ entityName: "ROLE_PERMISSION", entityId: roleId, action: "Update", newValue: JSON.stringify(permissions), performedBy: session.staffId }, client);
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

export async function getPermissionsForRole(roleId: string): Promise<Record<string, string>> {
  const { rows } = await query<{ moduleCode: string; accessLevel: string }>(
    `SELECT modulecode AS "moduleCode", accesslevel AS "accessLevel"
     FROM role_permission WHERE roleid = $1`,
    [roleId]
  );
  const map: Record<string, string> = {};
  for (const r of rows) map[r.moduleCode] = r.accessLevel;
  return map;
}

// ─── Request type create ───────────────────────────────────────────────────

export async function createRequestType(
  input: { typeName: string; domain: string; slaAckDays: number; slaClassifyDays: number; slaRouteDays: number },
  session: AuthSession
): Promise<RequestTypeRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const maxCode = await client.query<{ m: number }>(`SELECT COALESCE(MAX(typecode), 0) AS "m" FROM request_type`);
    const nextCode = maxCode.rows[0].m + 1;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO request_type (typecode, typename, domain, slaackdays, slaclassifydays, slaroutedays)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nextCode, input.typeName, input.domain, input.slaAckDays, input.slaClassifyDays, input.slaRouteDays]
    );
    await insertAuditEntry({ entityName: "REQUEST_TYPE", entityId: rows[0].id, action: "Insert", newValue: JSON.stringify(input), performedBy: session.staffId }, client);
    await client.query("COMMIT");
    return { id: rows[0].id, typeCode: nextCode, typeName: input.typeName, domain: input.domain, slaAckDays: input.slaAckDays, slaClassifyDays: input.slaClassifyDays, slaRouteDays: input.slaRouteDays };
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

// ─── Audit log viewer ──────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  entityName: string;
  entityId: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  performedByName: string;
  performedAt: string;
}

export async function listAuditLog(
  filters: { entityName?: string; action?: string; staffId?: string; from?: string; to?: string; limit?: number; offset?: number }
): Promise<{ rows: AuditLogEntry[]; total: number }> {
  const params: unknown[] = [];
  const wheres: string[] = [];

  if (filters.entityName) { params.push(filters.entityName); wheres.push(`a.entityname = $${params.length}`); }
  if (filters.action) { params.push(filters.action); wheres.push(`a.action = $${params.length}`); }
  if (filters.staffId) { params.push(filters.staffId); wheres.push(`a.performedby = $${params.length}`); }
  if (filters.from) { params.push(filters.from); wheres.push(`a.performedat >= $${params.length}::timestamptz`); }
  if (filters.to) { params.push(filters.to); wheres.push(`a.performedat <= $${params.length}::timestamptz`); }

  const whereStr = wheres.length ? "WHERE " + wheres.join(" AND ") : "";
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const countResult = await query<{ cnt: string }>(`SELECT COUNT(*) AS "cnt" FROM audit_log a ${whereStr}`, params);
  const total = parseInt(countResult.rows[0].cnt, 10);

  const dataParams = [...params, limit, offset];
  const { rows } = await query<AuditLogEntry>(
    `SELECT a.id AS "id", a.entityname AS "entityName", a.entityid AS "entityId",
            a.action AS "action", a.fieldname AS "fieldName",
            a.oldvalue AS "oldValue", a.newvalue AS "newValue",
            a.reason AS "reason",
            COALESCE(s.name, 'System') AS "performedByName",
            a.performedat AS "performedAt"
     FROM audit_log a
     LEFT JOIN staff s ON s.id = a.performedby
     ${whereStr}
     ORDER BY a.performedat DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );
  return { rows, total };
}
