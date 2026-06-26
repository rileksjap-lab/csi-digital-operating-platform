import pool, { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";
import type { AuthSession } from "@/lib/types/api";
import { insertAuditEntry } from "@/lib/db/audit";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SkillRow {
  id: string;
  skillName: string;
  technologyDomain: string;
}

export interface StaffSkillRow {
  staffId: string;
  staffName: string;
  staffCode: string;
  deptCode: string;
  subTeam: string | null;
  skillId: string;
  skillName: string;
  technologyDomain: string;
  competencyLevel: string;
  lastAssessmentDate: string;
  assessedByName: string;
}

export interface CertificationRow {
  id: string;
  staffId: string;
  staffName: string;
  staffCode: string;
  deptCode: string;
  certificationName: string;
  vendor: string | null;
  certificationLevel: string | null;
  issueDate: string;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
  status: string;
  evidenceFile: string | null;
}

export interface TrainingPlanRow {
  id: string;
  staffId: string;
  staffName: string;
  skillId: string | null;
  skillName: string | null;
  certificationId: string | null;
  certificationName: string | null;
  plannedActivity: string;
  targetDate: string | null;
  status: string;
  createdAt: string;
}

// ─── Scope helper ───────────────────────────────────────────────────────────

function staffScopeWhere(scope: ScopeFilter, paramOffset: number): { clause: string; params: unknown[] } {
  switch (scope.scope) {
    case "Department":
    case "Stream":
      return {
        clause: `AND s.deptid = $${paramOffset}`,
        params: [scope.departmentId],
      };
    case "Pod":
      return {
        clause: `AND s.deptid = $${paramOffset} AND s.subteam = $${paramOffset + 1}`,
        params: [scope.departmentId, scope.subTeam],
      };
    case "Self":
      return {
        clause: `AND s.id = $${paramOffset}`,
        params: [scope.staffId],
      };
  }
}

// ─── Skill inventory ────────────────────────────────────────────────────────

export async function listSkills(domain?: string): Promise<SkillRow[]> {
  const params: unknown[] = [];
  let where = "";
  if (domain) {
    params.push(domain);
    where = `WHERE sk.technologydomain = $1`;
  }
  const { rows } = await query<SkillRow>(
    `SELECT sk.id AS "id",
            sk.skillname AS "skillName",
            sk.technologydomain AS "technologyDomain"
     FROM skill sk
     ${where}
     ORDER BY sk.technologydomain, sk.skillname`,
    params
  );
  return rows;
}

export async function createSkill(
  input: { skillName: string; technologyDomain: string },
  session: AuthSession
): Promise<SkillRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<SkillRow>(
      `INSERT INTO skill (skillname, technologydomain)
       VALUES ($1, $2)
       RETURNING id AS "id", skillname AS "skillName", technologydomain AS "technologyDomain"`,
      [input.skillName, input.technologyDomain]
    );
    await insertAuditEntry(
      {
        entityName: "SKILL",
        entityId: rows[0].id,
        action: "Insert",
        newValue: JSON.stringify(input),
        performedBy: session.staffId,
      },
      client
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Staff skill assessments ────────────────────────────────────────────────

export async function listAssessments(
  filters: { staffId?: string; domain?: string },
  scope: ScopeFilter
): Promise<StaffSkillRow[]> {
  const params: unknown[] = [];
  const conditions: string[] = ["s.status = 'Active'"];

  if (filters.staffId) {
    params.push(filters.staffId);
    conditions.push(`s.id = $${params.length}`);
  }
  if (filters.domain) {
    params.push(filters.domain);
    conditions.push(`sk.technologydomain = $${params.length}`);
  }

  const { clause: scopeClause, params: scopeParams } = staffScopeWhere(scope, params.length + 1);
  params.push(...scopeParams);

  const { rows } = await query<StaffSkillRow>(
    `SELECT s.id AS "staffId",
            s.name AS "staffName",
            s.staffcode AS "staffCode",
            d.deptcode AS "deptCode",
            s.subteam AS "subTeam",
            sk.id AS "skillId",
            sk.skillname AS "skillName",
            sk.technologydomain AS "technologyDomain",
            ss.competencylevel AS "competencyLevel",
            ss.lastassessmentdate::text AS "lastAssessmentDate",
            a.name AS "assessedByName"
     FROM staff_skill ss
     JOIN staff s ON s.id = ss.staffid
     JOIN department d ON d.id = s.deptid
     JOIN skill sk ON sk.id = ss.skillid
     JOIN staff a ON a.id = ss.assessedby
     WHERE ${conditions.join(" AND ")} ${scopeClause}
     ORDER BY s.name, sk.technologydomain, sk.skillname`,
    params
  );
  return rows;
}

export async function upsertAssessment(
  input: {
    staffId: string;
    skillId: string;
    competencyLevel: string;
    lastAssessmentDate: string;
  },
  session: AuthSession
): Promise<StaffSkillRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT competencylevel FROM staff_skill WHERE staffid = $1 AND skillid = $2`,
      [input.staffId, input.skillId]
    );

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE staff_skill
         SET competencylevel = $1, lastassessmentdate = $2, assessedby = $3, updatedat = now()
         WHERE staffid = $4 AND skillid = $5`,
        [input.competencyLevel, input.lastAssessmentDate, session.staffId, input.staffId, input.skillId]
      );
      await insertAuditEntry(
        {
          entityName: "STAFF_SKILL",
          entityId: `${input.staffId}:${input.skillId}`,
          action: "Update",
          fieldName: "CompetencyLevel",
          oldValue: existing.rows[0].competencylevel,
          newValue: input.competencyLevel,
          performedBy: session.staffId,
        },
        client
      );
    } else {
      await client.query(
        `INSERT INTO staff_skill (staffid, skillid, competencylevel, lastassessmentdate, assessedby)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.staffId, input.skillId, input.competencyLevel, input.lastAssessmentDate, session.staffId]
      );
      await insertAuditEntry(
        {
          entityName: "STAFF_SKILL",
          entityId: `${input.staffId}:${input.skillId}`,
          action: "Insert",
          newValue: JSON.stringify(input),
          performedBy: session.staffId,
        },
        client
      );
    }

    await client.query("COMMIT");

    const { rows } = await query<StaffSkillRow>(
      `SELECT s.id AS "staffId",
              s.name AS "staffName",
              s.staffcode AS "staffCode",
              d.deptcode AS "deptCode",
              s.subteam AS "subTeam",
              sk.id AS "skillId",
              sk.skillname AS "skillName",
              sk.technologydomain AS "technologyDomain",
              ss.competencylevel AS "competencyLevel",
              ss.lastassessmentdate::text AS "lastAssessmentDate",
              a.name AS "assessedByName"
       FROM staff_skill ss
       JOIN staff s ON s.id = ss.staffid
       JOIN department d ON d.id = s.deptid
       JOIN skill sk ON sk.id = ss.skillid
       JOIN staff a ON a.id = ss.assessedby
       WHERE ss.staffid = $1 AND ss.skillid = $2`,
      [input.staffId, input.skillId]
    );
    return rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Certifications ─────────────────────────────────────────────────────────

export async function listCertifications(
  filters: { status?: string; vendor?: string; staffId?: string; expiringWithinDays?: number },
  scope: ScopeFilter
): Promise<CertificationRow[]> {
  const params: unknown[] = [];
  const conditions: string[] = ["s.status = 'Active'"];

  if (filters.staffId) {
    params.push(filters.staffId);
    conditions.push(`c.staffid = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`c.status = $${params.length}`);
  }
  if (filters.vendor) {
    params.push(filters.vendor);
    conditions.push(`c.vendor ILIKE $${params.length}`);
  }
  if (filters.expiringWithinDays) {
    params.push(filters.expiringWithinDays);
    conditions.push(`c.expirydate IS NOT NULL AND c.expirydate <= CURRENT_DATE + ($${params.length} || ' days')::interval AND c.expirydate >= CURRENT_DATE`);
  }

  const { clause: scopeClause, params: scopeParams } = staffScopeWhere(scope, params.length + 1);
  params.push(...scopeParams);

  const { rows } = await query<CertificationRow>(
    `SELECT c.id AS "id",
            c.staffid AS "staffId",
            s.name AS "staffName",
            s.staffcode AS "staffCode",
            d.deptcode AS "deptCode",
            c.certificationname AS "certificationName",
            c.vendor AS "vendor",
            c.certificationlevel AS "certificationLevel",
            c.issuedate::text AS "issueDate",
            c.expirydate::text AS "expiryDate",
            CASE WHEN c.expirydate IS NOT NULL
                 THEN (c.expirydate - CURRENT_DATE)
                 ELSE NULL END AS "daysUntilExpiry",
            c.status AS "status",
            c.evidencefile AS "evidenceFile"
     FROM certification c
     JOIN staff s ON s.id = c.staffid
     JOIN department d ON d.id = s.deptid
     WHERE ${conditions.join(" AND ")} ${scopeClause}
     ORDER BY c.expirydate ASC NULLS LAST, s.name`,
    params
  );
  return rows;
}

export async function createCertification(
  input: {
    certificationName: string;
    vendor?: string;
    certificationLevel?: string;
    issueDate: string;
    expiryDate?: string;
  },
  session: AuthSession
): Promise<CertificationRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO certification (staffid, certificationname, vendor, certificationlevel, issuedate, expirydate)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [session.staffId, input.certificationName, input.vendor ?? null, input.certificationLevel ?? null, input.issueDate, input.expiryDate ?? null]
    );
    const certId = rows[0].id;

    await insertAuditEntry(
      {
        entityName: "CERTIFICATION",
        entityId: certId,
        action: "Insert",
        newValue: JSON.stringify(input),
        performedBy: session.staffId,
      },
      client
    );
    await client.query("COMMIT");

    const result = await query<CertificationRow>(
      `SELECT c.id AS "id",
              c.staffid AS "staffId",
              s.name AS "staffName",
              s.staffcode AS "staffCode",
              d.deptcode AS "deptCode",
              c.certificationname AS "certificationName",
              c.vendor AS "vendor",
              c.certificationlevel AS "certificationLevel",
              c.issuedate::text AS "issueDate",
              c.expirydate::text AS "expiryDate",
              CASE WHEN c.expirydate IS NOT NULL
                   THEN (c.expirydate - CURRENT_DATE)
                   ELSE NULL END AS "daysUntilExpiry",
              c.status AS "status",
              c.evidencefile AS "evidenceFile"
       FROM certification c
       JOIN staff s ON s.id = c.staffid
       JOIN department d ON d.id = s.deptid
       WHERE c.id = $1`,
      [certId]
    );
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Training plans ─────────────────────────────────────────────────────────

export async function listTrainingPlans(
  filters: { staffId?: string; status?: string },
  scope: ScopeFilter
): Promise<TrainingPlanRow[]> {
  const params: unknown[] = [];
  const conditions: string[] = ["s.status = 'Active'"];

  if (filters.staffId) {
    params.push(filters.staffId);
    conditions.push(`tp.staffid = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`tp.status = $${params.length}`);
  }

  const { clause: scopeClause, params: scopeParams } = staffScopeWhere(scope, params.length + 1);
  params.push(...scopeParams);

  const { rows } = await query<TrainingPlanRow>(
    `SELECT tp.id AS "id",
            tp.staffid AS "staffId",
            s.name AS "staffName",
            tp.skillid AS "skillId",
            sk.skillname AS "skillName",
            tp.certificationid AS "certificationId",
            cert.certificationname AS "certificationName",
            tp.plannedactivity AS "plannedActivity",
            tp.targetdate::text AS "targetDate",
            tp.status AS "status",
            tp.createdat AS "createdAt"
     FROM training_plan tp
     JOIN staff s ON s.id = tp.staffid
     JOIN department d ON d.id = s.deptid
     LEFT JOIN skill sk ON sk.id = tp.skillid
     LEFT JOIN certification cert ON cert.id = tp.certificationid
     WHERE ${conditions.join(" AND ")} ${scopeClause}
     ORDER BY tp.targetdate ASC NULLS LAST, s.name`,
    params
  );
  return rows;
}

export async function createTrainingPlan(
  input: {
    staffId: string;
    skillId?: string;
    certificationId?: string;
    plannedActivity: string;
    targetDate?: string;
  },
  session: AuthSession
): Promise<TrainingPlanRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO training_plan (staffid, skillid, certificationid, plannedactivity, targetdate)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.staffId, input.skillId ?? null, input.certificationId ?? null, input.plannedActivity, input.targetDate ?? null]
    );
    const planId = rows[0].id;

    await insertAuditEntry(
      {
        entityName: "TRAINING_PLAN",
        entityId: planId,
        action: "Insert",
        newValue: JSON.stringify(input),
        performedBy: session.staffId,
      },
      client
    );
    await client.query("COMMIT");

    const result = await query<TrainingPlanRow>(
      `SELECT tp.id AS "id",
              tp.staffid AS "staffId",
              s.name AS "staffName",
              tp.skillid AS "skillId",
              sk.skillname AS "skillName",
              tp.certificationid AS "certificationId",
              cert.certificationname AS "certificationName",
              tp.plannedactivity AS "plannedActivity",
              tp.targetdate::text AS "targetDate",
              tp.status AS "status",
              tp.createdat AS "createdAt"
       FROM training_plan tp
       JOIN staff s ON s.id = tp.staffid
       LEFT JOIN skill sk ON sk.id = tp.skillid
       LEFT JOIN certification cert ON cert.id = tp.certificationid
       WHERE tp.id = $1`,
      [planId]
    );
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function patchTrainingPlan(
  planId: string,
  input: { status?: string; plannedActivity?: string; targetDate?: string },
  session: AuthSession
): Promise<TrainingPlanRow | null> {
  const setClauses: string[] = ["updatedat = now()"];
  const params: unknown[] = [];

  if (input.status) {
    params.push(input.status);
    setClauses.push(`status = $${params.length}`);
  }
  if (input.plannedActivity) {
    params.push(input.plannedActivity);
    setClauses.push(`plannedactivity = $${params.length}`);
  }
  if (input.targetDate) {
    params.push(input.targetDate);
    setClauses.push(`targetdate = $${params.length}`);
  }

  if (params.length === 0) return null;

  params.push(planId);
  const idParam = params.length;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE training_plan SET ${setClauses.join(", ")} WHERE id = $${idParam}`,
      params
    );
    if (!rowCount) {
      await client.query("ROLLBACK");
      return null;
    }

    await insertAuditEntry(
      {
        entityName: "TRAINING_PLAN",
        entityId: planId,
        action: "Update",
        newValue: JSON.stringify(input),
        performedBy: session.staffId,
      },
      client
    );
    await client.query("COMMIT");

    const result = await query<TrainingPlanRow>(
      `SELECT tp.id AS "id",
              tp.staffid AS "staffId",
              s.name AS "staffName",
              tp.skillid AS "skillId",
              sk.skillname AS "skillName",
              tp.certificationid AS "certificationId",
              cert.certificationname AS "certificationName",
              tp.plannedactivity AS "plannedActivity",
              tp.targetdate::text AS "targetDate",
              tp.status AS "status",
              tp.createdat AS "createdAt"
       FROM training_plan tp
       JOIN staff s ON s.id = tp.staffid
       LEFT JOIN skill sk ON sk.id = tp.skillid
       LEFT JOIN certification cert ON cert.id = tp.certificationid
       WHERE tp.id = $1`,
      [planId]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
