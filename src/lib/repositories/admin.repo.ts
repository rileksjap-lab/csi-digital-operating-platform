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
      { entityName: "STAFF", entityId: staffId, action: "Create", newValue: JSON.stringify(input), performedBy: session.staffId },
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
