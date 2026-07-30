import pool, { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";
import type { AuthSession } from "@/lib/types/api";
import { insertAuditEntry } from "@/lib/db/audit";
import { computeItKnowledgeLevel, currentQuarterLabel } from "@/lib/skills/it-knowledge";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ItKnowledgeQuestionAdminRow {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: string;
  category: string;
  isActive: boolean;
}

export interface ItKnowledgeQuizQuestion {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  category: string;
}

export interface ItKnowledgeAttemptRow {
  id: string;
  staffId: string;
  staffName: string;
  staffCode: string;
  deptCode: string;
  quarterLabel: string;
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  level: string;
  submittedAt: string;
}

function staffScopeWhere(scope: ScopeFilter, paramOffset: number): { clause: string; params: unknown[] } {
  switch (scope.scope) {
    case "Department":
    case "Stream":
      return { clause: `AND s.deptid = $${paramOffset}`, params: [scope.departmentId] };
    case "Pod":
      return { clause: `AND s.deptid = $${paramOffset} AND s.subteam = $${paramOffset + 1}`, params: [scope.departmentId, scope.subTeam] };
    case "Self":
      return { clause: `AND s.id = $${paramOffset}`, params: [scope.staffId] };
  }
}

// ─── Admin question bank ─────────────────────────────────────────────────────

export async function listQuestionsAdmin(): Promise<ItKnowledgeQuestionAdminRow[]> {
  const { rows } = await query<ItKnowledgeQuestionAdminRow>(
    `SELECT id AS "id", questiontext AS "questionText",
            optiona AS "optionA", optionb AS "optionB", optionc AS "optionC", optiond AS "optionD",
            correctoption AS "correctOption", category AS "category", isactive AS "isActive"
     FROM it_knowledge_question
     ORDER BY category, createdat`
  );
  return rows;
}

export async function createQuestion(
  input: { questionText: string; optionA: string; optionB: string; optionC: string; optionD: string; correctOption: string; category: string },
  session: AuthSession
): Promise<ItKnowledgeQuestionAdminRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO it_knowledge_question (questiontext, optiona, optionb, optionc, optiond, correctoption, category, isactive)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)
       RETURNING id`,
      [input.questionText, input.optionA, input.optionB, input.optionC, input.optionD, input.correctOption, input.category]
    );
    await insertAuditEntry(
      { entityName: "IT_KNOWLEDGE_QUESTION", entityId: rows[0].id, action: "Insert", newValue: JSON.stringify(input), performedBy: session.staffId },
      client
    );
    await client.query("COMMIT");
    const result = await query<ItKnowledgeQuestionAdminRow>(
      `SELECT id AS "id", questiontext AS "questionText",
              optiona AS "optionA", optionb AS "optionB", optionc AS "optionC", optiond AS "optionD",
              correctoption AS "correctOption", category AS "category", isactive AS "isActive"
       FROM it_knowledge_question WHERE id = $1`,
      [rows[0].id]
    );
    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function patchQuestion(
  id: string,
  input: Partial<{ questionText: string; optionA: string; optionB: string; optionC: string; optionD: string; correctOption: string; category: string; isActive: boolean }>,
  session: AuthSession
): Promise<ItKnowledgeQuestionAdminRow | null> {
  const columnMap: Record<string, string> = {
    questionText: "questiontext", optionA: "optiona", optionB: "optionb", optionC: "optionc", optionD: "optiond",
    correctOption: "correctoption", category: "category", isActive: "isactive",
  };
  const setClauses: string[] = ["updatedat = now()"];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    params.push(value);
    setClauses.push(`${columnMap[key]} = $${params.length}`);
  }
  if (params.length === 0) return null;
  params.push(id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `UPDATE it_knowledge_question SET ${setClauses.join(", ")} WHERE id = $${params.length}`,
      params
    );
    if (!rowCount) {
      await client.query("ROLLBACK");
      return null;
    }
    await insertAuditEntry(
      { entityName: "IT_KNOWLEDGE_QUESTION", entityId: id, action: "Update", newValue: JSON.stringify(input), performedBy: session.staffId },
      client
    );
    await client.query("COMMIT");
    const result = await query<ItKnowledgeQuestionAdminRow>(
      `SELECT id AS "id", questiontext AS "questionText",
              optiona AS "optionA", optionb AS "optionB", optionc AS "optionC", optiond AS "optionD",
              correctoption AS "correctOption", category AS "category", isactive AS "isActive"
       FROM it_knowledge_question WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Quiz taking ──────────────────────────────────────────────────────────────

export async function listActiveQuizQuestions(): Promise<ItKnowledgeQuizQuestion[]> {
  const { rows } = await query<ItKnowledgeQuizQuestion>(
    `SELECT id AS "id", questiontext AS "questionText",
            optiona AS "optionA", optionb AS "optionB", optionc AS "optionC", optiond AS "optionD",
            category AS "category"
     FROM it_knowledge_question
     WHERE isactive = true
     ORDER BY category, createdat`
  );
  return rows;
}

export async function submitAttempt(
  answers: Record<string, string>,
  session: AuthSession
): Promise<ItKnowledgeAttemptRow> {
  const questionIds = Object.keys(answers);
  if (questionIds.length === 0) {
    throw Object.assign(new Error("No answers submitted"), { code: "NO_ANSWERS" });
  }

  const { rows: activeQuestions } = await query<{ id: string; correctoption: string }>(
    `SELECT id, correctoption FROM it_knowledge_question WHERE isactive = true`
  );
  const activeIds = new Set(activeQuestions.map((q) => q.id));
  if (activeQuestions.length === 0) {
    throw Object.assign(new Error("No active questions available"), { code: "NO_ACTIVE_QUESTIONS" });
  }
  const missing = activeQuestions.filter((q) => !(q.id in answers));
  if (missing.length > 0) {
    throw Object.assign(new Error("Every active question must be answered"), { code: "INCOMPLETE_ANSWERS" });
  }
  const stray = questionIds.filter((id) => !activeIds.has(id));
  if (stray.length > 0) {
    throw Object.assign(new Error("Answer set includes inactive/unknown questions"), { code: "INVALID_ANSWERS" });
  }

  const correctCount = activeQuestions.filter((q) => answers[q.id] === q.correctoption).length;
  const totalQuestions = activeQuestions.length;
  const scorePercent = Math.round((correctCount / totalQuestions) * 100);
  const level = computeItKnowledgeLevel(scorePercent);
  const quarterLabel = currentQuarterLabel();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO it_knowledge_attempt (staffid, quarterlabel, totalquestions, correctcount, scorepercent, level, answers)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [session.staffId, quarterLabel, totalQuestions, correctCount, scorePercent, level, JSON.stringify(answers)]
    );
    await insertAuditEntry(
      {
        entityName: "IT_KNOWLEDGE_ATTEMPT",
        entityId: rows[0].id,
        action: "Insert",
        newValue: JSON.stringify({ quarterLabel, totalQuestions, correctCount, scorePercent, level }),
        performedBy: session.staffId,
      },
      client
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const result = await query<ItKnowledgeAttemptRow>(
    `SELECT a.id AS "id", a.staffid AS "staffId", s.name AS "staffName", s.staffcode AS "staffCode",
            d.deptcode AS "deptCode", a.quarterlabel AS "quarterLabel",
            a.totalquestions AS "totalQuestions", a.correctcount AS "correctCount",
            a.scorepercent AS "scorePercent", a.level AS "level", a.submittedat AS "submittedAt"
     FROM it_knowledge_attempt a
     JOIN staff s ON s.id = a.staffid
     JOIN department d ON d.id = s.deptid
     WHERE a.staffid = $1 AND a.quarterlabel = $2`,
    [session.staffId, quarterLabel]
  );
  return result.rows[0];
}

export async function listAttempts(
  filters: { staffId?: string },
  scope: ScopeFilter
): Promise<ItKnowledgeAttemptRow[]> {
  const params: unknown[] = [];
  const conditions: string[] = ["s.status = 'Active'"];
  if (filters.staffId) {
    params.push(filters.staffId);
    conditions.push(`a.staffid = $${params.length}`);
  }
  const { clause: scopeClause, params: scopeParams } = staffScopeWhere(scope, params.length + 1);
  params.push(...scopeParams);

  const { rows } = await query<ItKnowledgeAttemptRow>(
    `SELECT a.id AS "id", a.staffid AS "staffId", s.name AS "staffName", s.staffcode AS "staffCode",
            d.deptcode AS "deptCode", a.quarterlabel AS "quarterLabel",
            a.totalquestions AS "totalQuestions", a.correctcount AS "correctCount",
            a.scorepercent AS "scorePercent", a.level AS "level", a.submittedat AS "submittedAt"
     FROM it_knowledge_attempt a
     JOIN staff s ON s.id = a.staffid
     JOIN department d ON d.id = s.deptid
     WHERE ${conditions.join(" AND ")} ${scopeClause}
     ORDER BY a.submittedat DESC`,
    params
  );
  return rows;
}
