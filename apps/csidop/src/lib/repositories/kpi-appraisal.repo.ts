import type { PoolClient } from "pg";
import pool, { query } from "@/lib/db/pool";
import { insertAuditEntry } from "@/lib/db/audit";
import type { AuthSession } from "@/lib/types/api";
import {
  appraisalTotals, certificateScore, outcomeFor, DEFAULT_COMPONENT_MAX,
  type CertConfig, type ComponentMax, type ScoredEntry,
} from "@/lib/kpi/scoring";
import {
  allowedActions, canView, checkTransition, editable, hidesOtherRatings, ratingAt, signOffRights, stageForStatus, stageProblems,
  type Actor, type AppraisalStatus, type ItemMeta, type LineMeta, type ScoreRow, type Stage, type WorkflowAction, type WorkflowContext,
} from "@/lib/kpi/workflow";

// Appraisals: opening them for a cycle, reading and filling the form, and
// moving them through the workflow. Every rule about who may do what comes
// from lib/kpi/workflow.ts; this file only loads data, checks the rule and writes.

type Db = Pick<PoolClient, "query">;
export type Fail = { ok: false; status: 400 | 403 | 404 | 409 | 502; message: string; problems?: string[] };
export type Done<T> = { ok: true; value: T };
export type Result<T> = Done<T> | Fail;
const fail = (status: Fail["status"], message: string, problems?: string[]): Fail => ({ ok: false, status, message, problems });
const done = <T>(value: T): Done<T> => ({ ok: true, value });

// Reads outside a transaction go through the shared pool.
const poolDb = { query: (text: string, params?: unknown[]) => query(text, params) } as unknown as Db;

const actorOf = (s: AuthSession): Actor => ({ staffId: s.staffId, role: s.role });

interface AppraisalRow {
  id: string; cycleId: string; staffId: string; templateId: string; reviewerId: string; finalApproverId: string;
  status: AppraisalStatus; returnNote: string | null;
  selfSubmittedAt: string | null; reviewSubmittedAt: string | null; finalisedAt: string | null; sentToHrAt: string | null;
  kraPoints: number | null; valuePoints: number | null; bonusPoints: number | null; totalPoints: number | null; outcome: string | null;
  recommendations: Record<string, string[]>; svpOpsName: string | null; svpOpsDate: string | null;
  staffName: string; staffRoleCode: string; staffDeptId: string; subTeam: string | null;
  deptName: string; cycleName: string; cycleStart: string; cycleEnd: string;
  svpDeptSignedAt: string | null; svpDeptSignedByName: string | null;
  reviewerName: string; finalApproverName: string; templateName: string;
}

const APPRAISAL_SQL = `
  SELECT a.id, a.cycleid AS "cycleId", a.staffid AS "staffId", a.templateid AS "templateId",
         a.reviewerid AS "reviewerId", a.finalapproverid AS "finalApproverId", a.status, a.returnnote AS "returnNote",
         a.selfsubmittedat AS "selfSubmittedAt", a.reviewsubmittedat AS "reviewSubmittedAt",
         a.finalisedat AS "finalisedAt", a.senttohrat AS "sentToHrAt",
         a.krapoints::float AS "kraPoints", a.valuepoints::float AS "valuePoints", a.bonuspoints::float AS "bonusPoints",
         a.totalpoints::float AS "totalPoints", a.outcome, a.recommendations,
         a.svpopsname AS "svpOpsName", to_char(a.svpopsdate, 'YYYY-MM-DD') AS "svpOpsDate",
         s.name AS "staffName", r.rolecode AS "staffRoleCode", s.deptid AS "staffDeptId", s.subteam AS "subTeam",
         rv.name AS "reviewerName", fa.name AS "finalApproverName", t.displayname AS "templateName",
         d.deptname AS "deptName", c.name AS "cycleName",
         to_char(c.periodstart, 'YYYY-MM-DD') AS "cycleStart", to_char(c.periodend, 'YYYY-MM-DD') AS "cycleEnd",
         a.svpdeptsignedat AS "svpDeptSignedAt", sv.name AS "svpDeptSignedByName"
  FROM kpi_appraisal a
  JOIN staff s ON s.id = a.staffid JOIN role r ON r.id = s.roleid JOIN department d ON d.id = s.deptid
  JOIN staff rv ON rv.id = a.reviewerid JOIN staff fa ON fa.id = a.finalapproverid
  JOIN kpi_template t ON t.id = a.templateid JOIN kpi_cycle c ON c.id = a.cycleid
  LEFT JOIN staff sv ON sv.id = a.svpdeptsignedby`;

async function loadAppraisal(db: Db, id: string, lock = false): Promise<AppraisalRow | null> {
  const res = await db.query<AppraisalRow>(`${APPRAISAL_SQL} WHERE a.id = $1 ${lock ? "FOR UPDATE OF a" : ""}`, [id]);
  return res.rows[0] ?? null;
}

const ctxOf = (a: AppraisalRow): WorkflowContext => ({
  status: a.status, staffId: a.staffId, reviewerId: a.reviewerId, finalApproverId: a.finalApproverId,
});

function inScope(a: AppraisalRow, s: AuthSession): boolean {
  return s.role === "SVP" || (s.role === "HOD" && s.departmentId === a.staffDeptId);
}

interface Meta {
  lines: (LineMeta & { weight: number; lineNo: number; target: string | null; measurement: string | null; explanation: string | null; autoMetric: string | null; bands: Record<string, string> })[];
  items: (ItemMeta & { weight: number; section: "Value" | "Bonus"; itemNo: number; description: string | null; bands: Record<string, string> })[];
  certConfig: CertConfig | null;
  componentMax: ComponentMax;
  careerOptions: string[];
  ratingScale: Record<string, string>;
  outcomeRemark: string;
  outcomeBands: { minScore: number; outcome: string }[];
}

async function loadMeta(db: Db, a: AppraisalRow): Promise<Meta> {
  const [lines, items, cycle, bands] = await Promise.all([
    db.query(
      `SELECT id, lineno AS "lineNo", name, weight::float AS weight, evidencerequired AS "evidenceRequired",
              target, measurement, explanation, autometric AS "autoMetric", bands
       FROM kpi_template_line WHERE templateid = $1 ORDER BY lineno`, [a.templateId]),
    db.query(
      `SELECT id, itemno AS "itemNo", section, name, description, weight::float AS weight, scalemax AS "scaleMax",
              inputmode AS "inputMode", bands
       FROM kpi_item WHERE cycleid = $1 ORDER BY itemno`, [a.cycleId]),
    db.query(`SELECT config FROM kpi_cycle WHERE id = $1`, [a.cycleId]),
    db.query(`SELECT minscore::float AS "minScore", outcome FROM kpi_outcome_band WHERE cycleid = $1`, [a.cycleId]),
  ]);
  const config = (cycle.rows[0]?.config ?? {}) as {
    certificates?: CertConfig; componentMax?: ComponentMax; careerOptions?: string[]; ratingScale?: Record<string, string>; outcomeRemark?: string;
  };
  return {
    lines: lines.rows as Meta["lines"], items: items.rows as Meta["items"],
    certConfig: config.certificates ?? null,
    componentMax: config.componentMax ?? DEFAULT_COMPONENT_MAX,
    careerOptions: config.careerOptions ?? [],
    ratingScale: config.ratingScale ?? {},
    outcomeRemark: config.outcomeRemark ?? "",
    outcomeBands: bands.rows as Meta["outcomeBands"],
  };
}

const SCORE_SQL = `
  SELECT lineid AS "lineId", itemid AS "itemId",
         selfrating AS "selfRating", selfcomment AS "selfComment", selfevidence AS "selfEvidence",
         reviewerrating AS "reviewerRating", reviewercomment AS "reviewerComment", reviewerevidence AS "reviewerEvidence",
         finalrating AS "finalRating", finalcomment AS "finalComment"
  FROM kpi_appraisal_score WHERE appraisalid = $1`;

async function loadCerts(db: Db, id: string) {
  const res = await db.query<{ id: string; name: string; yearLabel: string | null; category: string }>(
    `SELECT id, name, yearlabel AS "yearLabel", category FROM kpi_appraisal_cert WHERE appraisalid = $1 ORDER BY createdat, id`, [id]);
  return res.rows;
}

/** Points per component at the given stage's ratings. The certification item is calculated, never typed. */
function totalsAt(meta: Meta, rows: ScoreRow[], certScore: number, stage: Stage) {
  const byLine = new Map(rows.filter((r) => r.lineId).map((r) => [r.lineId as string, r]));
  const byItem = new Map(rows.filter((r) => r.itemId).map((r) => [r.itemId as string, r]));
  const kra: ScoredEntry[] = meta.lines.map((l) => ({ weight: l.weight, scaleMax: 5, score: byLine.has(l.id) ? ratingAt(byLine.get(l.id)!, stage) : null }));
  const entry = (i: Meta["items"][number]): ScoredEntry => ({
    weight: i.weight, scaleMax: i.scaleMax,
    score: i.inputMode === "Certificates" ? certScore : byItem.has(i.id) ? ratingAt(byItem.get(i.id)!, stage) : null,
  });
  const totals = appraisalTotals(
    { kra, value: meta.items.filter((i) => i.section === "Value").map(entry), bonus: meta.items.filter((i) => i.section === "Bonus").map(entry) },
    meta.componentMax
  );
  return { ...totals, outcome: outcomeFor(totals.total, meta.outcomeBands) };
}

// ── Opening appraisals for a cycle ──────────────────────────────────────────

export async function createAppraisals(cycleId: string, session: AuthSession) {
  const cycle = await query<{ status: string }>(`SELECT status FROM kpi_cycle WHERE id = $1`, [cycleId]);
  if (cycle.rows.length === 0) return fail(404, "KPI cycle not found");
  if (cycle.rows[0].status !== "Open") return fail(409, "Set the cycle to Open before opening appraisals");

  const people = await query<{ id: string; name: string; roleId: string; roleCode: string; reportsTo: string | null }>(
    `SELECT s.id, s.name, s.roleid AS "roleId", r.rolecode AS "roleCode", s.reportsto AS "reportsTo"
     FROM staff s JOIN role r ON r.id = s.roleid
     WHERE s.status = 'Active' AND s.deptid = $1 AND r.rolecode <> 'SVP'
       AND NOT EXISTS (SELECT 1 FROM kpi_appraisal a WHERE a.cycleid = $2 AND a.staffid = s.id)
     ORDER BY s.name`,
    [session.departmentId, cycleId]
  );
  const svp = await query<{ id: string }>(
    `SELECT s.id FROM staff s JOIN role r ON r.id = s.roleid WHERE s.status = 'Active' AND r.rolecode = 'SVP' ORDER BY s.createdat LIMIT 1`
  );
  const templates = await query<{ id: string; roleId: string }>(`SELECT id, roleid AS "roleId" FROM kpi_template WHERE cycleid = $1`, [cycleId]);
  const tplByRole = new Map(templates.rows.map((t) => [t.roleId, t.id]));

  const created: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of people.rows) {
      const templateId = tplByRole.get(p.roleId);
      if (!templateId) { skipped.push({ name: p.name, reason: "No KPI template for this role in the cycle" }); continue; }
      if (!p.reportsTo) { skipped.push({ name: p.name, reason: "No immediate superior set (Reporting lines)" }); continue; }
      // The HOD is appraised by the SVP; everyone else is finalised by the HOD.
      const approverId = p.roleCode === "HOD" ? svp.rows[0]?.id : session.staffId;
      if (!approverId) { skipped.push({ name: p.name, reason: "No SVP user exists to finalise the HOD's appraisal" }); continue; }
      if (approverId === p.id || p.reportsTo === p.id) { skipped.push({ name: p.name, reason: "Reviewer and approver must be someone else" }); continue; }

      const ins = await client.query<{ id: string }>(
        `INSERT INTO kpi_appraisal (cycleid, staffid, templateid, reviewerid, finalapproverid)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [cycleId, p.id, templateId, p.reportsTo, approverId]
      );
      await insertAuditEntry(
        { entityName: "KPI_APPRAISAL", entityId: ins.rows[0].id, action: "Insert", fieldName: "Status", newValue: "SelfAssessment", performedBy: session.staffId },
        client
      );
      created.push(ins.rows[0].id);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return done({ created: created.length, skipped });
}

// ── Lists and detail ────────────────────────────────────────────────────────

export async function listAppraisals(cycleId: string, session: AuthSession) {
  const wide = session.role === "SVP" || session.role === "HOD";
  const res = await query<AppraisalRow>(
    `${APPRAISAL_SQL}
     WHERE a.cycleid = $1
       AND ( ($2::boolean AND ($3 = 'SVP' OR s.deptid = $4))
             OR a.staffid = $5 OR a.reviewerid = $5 OR a.finalapproverid = $5 )
     ORDER BY s.name`,
    [cycleId, wide, session.role, session.departmentId, session.staffId]
  );
  const actor = actorOf(session);
  return res.rows.map((a) => {
    const ctx = ctxOf(a);
    const showResult = !hidesOtherRatings(ctx, actor);
    return {
      id: a.id, staffId: a.staffId, staffName: a.staffName, roleName: a.templateName, subTeam: a.subTeam,
      status: a.status, reviewerName: a.reviewerName, finalApproverName: a.finalApproverName,
      totalPoints: showResult ? a.totalPoints : null, outcome: showResult ? a.outcome : null,
      actions: allowedActions(ctx, actor),
    };
  });
}

async function buildDetail(a: AppraisalRow, actor: Actor) {
  const id = a.id;
  const ctx = ctxOf(a);
  const [meta, scoreRes, certs, oneRes] = await Promise.all([
    loadMeta(poolDb, a),
    poolDb.query<ScoreRow>(SCORE_SQL, [id]),
    loadCerts(poolDb, id),
    poolDb.query(
      `SELECT to_char(meetingdate, 'YYYY-MM-DD') AS "meetingDate", notes, agreedactions AS "agreedActions",
              recordedat AS "recordedAt", employeeackat AS "employeeAckAt"
       FROM kpi_one_on_one WHERE appraisalid = $1`, [id]),
  ]);

  const hide = hidesOtherRatings(ctx, actor);
  const rows = scoreRes.rows.map((r) =>
    hide ? { ...r, reviewerRating: null, reviewerComment: null, reviewerEvidence: null, finalRating: null, finalComment: null } : r
  );
  const cert = meta.certConfig ? certificateScore(certs, meta.certConfig) : { totalPoints: 0, qualified: false, score: 0 };
  const stage: Stage = hide ? "self" : stageForStatus(a.status);
  const totals = totalsAt(meta, rows, cert.score, stage);

  const problems: Partial<Record<Stage, string[]>> = { self: stageProblems("self", meta.lines, meta.items, rows) };
  if (!hide) {
    problems.reviewer = stageProblems("reviewer", meta.lines, meta.items, rows);
    problems.final = stageProblems("final", meta.lines, meta.items, rows);
  }

  return {
    id: a.id, cycleId: a.cycleId, status: a.status, returnNote: a.returnNote,
    staff: { id: a.staffId, name: a.staffName, roleName: a.templateName, subTeam: a.subTeam },
    reviewer: { id: a.reviewerId, name: a.reviewerName },
    finalApprover: { id: a.finalApproverId, name: a.finalApproverName },
    submittedAt: { self: a.selfSubmittedAt, review: a.reviewSubmittedAt, finalised: a.finalisedAt, sentToHr: a.sentToHrAt },
    lines: meta.lines, items: meta.items, careerOptions: meta.careerOptions, certConfig: meta.certConfig,
    outcomeBands: meta.outcomeBands,
    scores: rows, certs, certResult: cert,
    oneOnOne: oneRes.rows[0] ?? null,
    deptName: a.deptName, cycle: { name: a.cycleName, periodStart: a.cycleStart, periodEnd: a.cycleEnd },
    ratingScale: meta.ratingScale, outcomeRemark: meta.outcomeRemark,
    recommendations: hide ? {} : a.recommendations,
    svpOps: hide ? { name: null, date: null } : { name: a.svpOpsName, date: a.svpOpsDate },
    svpDept: hide ? { signedAt: null, signedBy: null } : { signedAt: a.svpDeptSignedAt, signedBy: a.svpDeptSignedByName },
    signOffRights: signOffRights(ctx, actor),
    totals, snapshot: hide ? null : { total: a.totalPoints, outcome: a.outcome },
    problems, editable: editable(ctx, actor), actions: allowedActions(ctx, actor), ratingsHidden: hide,
  };
}

export type AppraisalDetail = Awaited<ReturnType<typeof buildDetail>>;

export async function getAppraisal(id: string, session: AuthSession): Promise<Result<AppraisalDetail>> {
  const a = await loadAppraisal(poolDb, id);
  if (!a || !canView(ctxOf(a), actorOf(session), inScope(a, session))) return fail(404, "Appraisal not found");
  return done(await buildDetail(a, actorOf(session)));
}

// Someone who is nobody on the appraisal and holds no edit rights, so every
// rating is visible and nothing is editable: used to build the HR report.
const REPORT_ACTOR: Actor = { staffId: "00000000-0000-0000-0000-000000000000", role: "SVP" };

export async function getAppraisalForReport(id: string): Promise<AppraisalDetail | null> {
  const a = await loadAppraisal(poolDb, id);
  return a ? buildDetail(a, REPORT_ACTOR) : null;
}

// ── Filling in the form ─────────────────────────────────────────────────────

export interface ScoreInput {
  lineId?: string; itemId?: string;
  rating: number | null; comment?: string | null; evidence?: string | null;
}

export async function saveScores(id: string, session: AuthSession, inputs: ScoreInput[]): Promise<Result<{ saved: number }>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const a = await loadAppraisal(client, id, true);
    if (!a || !canView(ctxOf(a), actorOf(session), inScope(a, session))) { await client.query("ROLLBACK"); return fail(404, "Appraisal not found"); }
    const can = editable(ctxOf(a), actorOf(session));
    const stage: Stage | null = can.self ? "self" : can.reviewer ? "reviewer" : can.final ? "final" : null;
    if (!stage) { await client.query("ROLLBACK"); return fail(403, "You cannot change ratings on this appraisal right now"); }

    const meta = await loadMeta(client, a);
    const lineIds = new Set(meta.lines.map((l) => l.id));
    const itemById = new Map(meta.items.map((i) => [i.id, i]));

    for (const s of inputs) {
      if (!!s.lineId === !!s.itemId) { await client.query("ROLLBACK"); return fail(400, "Each score is for one line or one item"); }
      let max = 5;
      if (s.lineId) {
        if (!lineIds.has(s.lineId)) { await client.query("ROLLBACK"); return fail(400, "A line does not belong to this appraisal"); }
      } else {
        const item = itemById.get(s.itemId as string);
        if (!item) { await client.query("ROLLBACK"); return fail(400, "An item does not belong to this appraisal"); }
        if (item.inputMode === "Certificates") { await client.query("ROLLBACK"); return fail(400, `"${item.name}" is calculated from the certificate list`); }
        max = item.scaleMax;
      }
      if (s.rating !== null && (!Number.isInteger(s.rating) || s.rating < 1 || s.rating > max)) {
        await client.query("ROLLBACK"); return fail(400, `Rating must be a whole number from 1 to ${max}`);
      }
      const comment = s.comment?.trim() || null;
      const evidence = s.evidence?.trim() || null;
      const target = s.lineId ? "lineid" : "itemid";
      const cols =
        stage === "self" ? ["selfrating", "selfcomment", "selfevidence"]
        : stage === "reviewer" ? ["reviewerrating", "reviewercomment", "reviewerevidence"]
        : ["finalrating", "finalcomment", null];
      const insertCols = cols.filter(Boolean) as string[];
      const setParts = insertCols.map((c) => `${c} = EXCLUDED.${c}`);
      const values = stage === "final" ? [s.rating, comment] : [s.rating, comment, evidence];
      await client.query(
        `INSERT INTO kpi_appraisal_score (appraisalid, ${target}, ${insertCols.join(", ")})
         VALUES ($1, $2, ${insertCols.map((_, k) => `$${k + 3}`).join(", ")})
         ON CONFLICT (appraisalid, ${target}) DO UPDATE SET ${setParts.join(", ")}, updatedat = now()`,
        [id, s.lineId ?? s.itemId, ...values]
      );
    }
    await client.query(`UPDATE kpi_appraisal SET updatedat = now() WHERE id = $1`, [id]);
    await client.query("COMMIT");
    return done({ saved: inputs.length });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function saveCerts(id: string, session: AuthSession, certs: { name: string; yearLabel?: string | null; category: string }[]): Promise<Result<{ saved: number }>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const a = await loadAppraisal(client, id, true);
    if (!a || !canView(ctxOf(a), actorOf(session), inScope(a, session))) { await client.query("ROLLBACK"); return fail(404, "Appraisal not found"); }
    const can = editable(ctxOf(a), actorOf(session));
    if (!(can.self || can.reviewer || can.final)) { await client.query("ROLLBACK"); return fail(403, "You cannot change the certificate list right now"); }

    const meta = await loadMeta(client, a);
    const known = new Set((meta.certConfig?.categories ?? []).map((c) => c.code));
    if (certs.some((c) => !known.has(c.category))) { await client.query("ROLLBACK"); return fail(400, "Unknown certificate category"); }

    await client.query(`DELETE FROM kpi_appraisal_cert WHERE appraisalid = $1`, [id]);
    for (const c of certs) {
      await client.query(`INSERT INTO kpi_appraisal_cert (appraisalid, name, yearlabel, category) VALUES ($1, $2, $3, $4)`,
        [id, c.name.trim(), c.yearLabel?.trim() || null, c.category]);
    }
    await client.query("COMMIT");
    return done({ saved: certs.length });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function recordOneOnOne(
  id: string, session: AuthSession, input: { meetingDate: string; notes?: string | null; agreedActions?: string | null }
): Promise<Result<{ recorded: true }>> {
  const a = await loadAppraisal(poolDb, id);
  if (!a || !canView(ctxOf(a), actorOf(session), inScope(a, session))) return fail(404, "Appraisal not found");
  if (!editable(ctxOf(a), actorOf(session)).oneOnOne) return fail(403, "Only the immediate superior can record the 1:1, while reviewing");
  await query(
    `INSERT INTO kpi_one_on_one (appraisalid, meetingdate, notes, agreedactions, recordedby)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (appraisalid) DO UPDATE SET meetingdate = EXCLUDED.meetingdate, notes = EXCLUDED.notes,
       agreedactions = EXCLUDED.agreedactions, recordedby = EXCLUDED.recordedby, recordedat = now()`,
    [id, input.meetingDate, input.notes?.trim() || null, input.agreedActions?.trim() || null, session.staffId]
  );
  return done({ recorded: true });
}

export async function acknowledgeOneOnOne(id: string, session: AuthSession): Promise<Result<{ acknowledged: true }>> {
  const a = await loadAppraisal(poolDb, id);
  if (!a || !canView(ctxOf(a), actorOf(session), inScope(a, session))) return fail(404, "Appraisal not found");
  if (!editable(ctxOf(a), actorOf(session)).acknowledge) return fail(403, "You cannot confirm the 1:1 on this appraisal right now");
  const res = await query(`UPDATE kpi_one_on_one SET employeeackat = now() WHERE appraisalid = $1 RETURNING id`, [id]);
  if (res.rows.length === 0) return fail(409, "The 1:1 has not been recorded yet");
  return done({ acknowledged: true });
}

// ── Moving through the workflow ─────────────────────────────────────────────

export async function transition(
  id: string, session: AuthSession, action: WorkflowAction, note?: string | null
): Promise<Result<{ status: AppraisalStatus }>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const a = await loadAppraisal(client, id, true);
    if (!a || !canView(ctxOf(a), actorOf(session), inScope(a, session))) { await client.query("ROLLBACK"); return fail(404, "Appraisal not found"); }

    const check = checkTransition(action, ctxOf(a), actorOf(session));
    if (!check.ok) { await client.query("ROLLBACK"); return fail(403, check.reason); }
    const reason = note?.trim() || null;
    if (check.noteRequired && !reason) { await client.query("ROLLBACK"); return fail(400, "Please say why"); }

    const meta = await loadMeta(client, a);
    const rows = (await client.query<ScoreRow>(SCORE_SQL, [id])).rows;
    if (check.needs) {
      const problems = stageProblems(check.needs, meta.lines, meta.items, rows);
      if (problems.length > 0) { await client.query("ROLLBACK"); return fail(409, "The form is not complete yet", problems); }
    }
    if (action === "submitReview") {
      const one = await client.query(`SELECT 1 FROM kpi_one_on_one WHERE appraisalid = $1`, [id]);
      if (one.rows.length === 0) { await client.query("ROLLBACK"); return fail(409, "Record the 1:1 meeting before submitting the review"); }
    }

    // The superior's ratings become the starting point for the final score.
    if (action === "submitReview") {
      await client.query(`UPDATE kpi_appraisal_score SET finalrating = reviewerrating WHERE appraisalid = $1 AND finalrating IS NULL`, [id]);
    }

    let snapshot: { kra: number; value: number; bonus: number; total: number; outcome: string | null } | null = null;
    if (check.to === "Finalised") {
      const finalRows = (await client.query<ScoreRow>(SCORE_SQL, [id])).rows;
      const certs = await loadCerts(client, id);
      const certScore = meta.certConfig ? certificateScore(certs, meta.certConfig).score : 0;
      snapshot = totalsAt(meta, finalRows, certScore, "final");
    }

    const sets: string[] = ["status = $2", "updatedat = now()"];
    const params: unknown[] = [id, check.to];
    const set = (frag: string, v?: unknown) => { if (v !== undefined) params.push(v); sets.push(frag.replace("?", `$${params.length}`)); };
    switch (action) {
      case "submitSelf": sets.push("selfsubmittedat = now()", "returnnote = NULL"); break;
      case "returnToStaff": sets.push("selfsubmittedat = NULL"); set("returnnote = ?", reason); break;
      case "submitReview": sets.push("reviewsubmittedat = now()", "returnnote = NULL"); break;
      case "returnToReviewer": sets.push("reviewsubmittedat = NULL"); set("returnnote = ?", reason); break;
      case "finalise": break;
      case "reopen": sets.push("finalisedat = NULL", "krapoints = NULL", "valuepoints = NULL", "bonuspoints = NULL", "totalpoints = NULL", "outcome = NULL"); set("returnnote = ?", reason); break;
      case "sendToHR": sets.push("senttohrat = now()"); set("senttohrby = ?", session.staffId); break;
    }
    if (snapshot) {
      sets.push("finalisedat = now()", "returnnote = NULL");
      set("krapoints = ?", snapshot.kra); set("valuepoints = ?", snapshot.value); set("bonuspoints = ?", snapshot.bonus);
      set("totalpoints = ?", snapshot.total); set("outcome = ?", snapshot.outcome);
    }
    // A step can both submit and finalise, so the same column may be named twice.
    await client.query(`UPDATE kpi_appraisal SET ${[...new Set(sets)].join(", ")} WHERE id = $1`, params);

    await insertAuditEntry(
      {
        entityName: "KPI_APPRAISAL", entityId: id,
        action: action === "finalise" ? "Approve" : action === "returnToStaff" || action === "returnToReviewer" ? "Return" : "StatusChange",
        fieldName: "Status", oldValue: a.status, newValue: check.to, reason, performedBy: session.staffId,
      },
      client
    );
    await client.query("COMMIT");
    return done({ status: check.to });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Sign-off: career recommendation, SVP-Operations, SVP-Department ────────

export interface SignOffInput {
  hodTicks?: string[];
  svpTicks?: string[];
  opsName?: string | null;
  opsDate?: string | null;
  svpSign?: boolean;
}

/** Saves only the parts of the sign-off the caller is allowed to touch right now. */
export async function saveSignOff(id: string, session: AuthSession, input: SignOffInput): Promise<Result<{ saved: true }>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const a = await loadAppraisal(client, id, true);
    if (!a || !canView(ctxOf(a), actorOf(session), inScope(a, session))) { await client.query("ROLLBACK"); return fail(404, "Appraisal not found"); }
    const rights = signOffRights(ctxOf(a), actorOf(session));
    const meta = await loadMeta(client, a);

    const deny = async (msg: string) => { await client.query("ROLLBACK"); return fail(403, msg); };
    const known = new Set(meta.careerOptions);
    const badTick = (t?: string[]) => !!t && t.some((x) => !known.has(x));
    if (badTick(input.hodTicks) || badTick(input.svpTicks)) { await client.query("ROLLBACK"); return fail(400, "Unknown recommendation option"); }
    if (input.hodTicks !== undefined && !rights.hodTicks) return deny("Only the HOD who finalises this appraisal can set the HOD recommendation, while reviewing it");
    if (input.svpTicks !== undefined && !rights.svpTicks) return deny("Only the SVP can set the SVP recommendation, and not on their own appraisal");
    if ((input.opsName !== undefined || input.opsDate !== undefined) && !rights.opsName) return deny("The SVP-Operations name and date can be set by the HOD or SVP before the appraisal is sent");
    if (input.svpSign && !rights.svpSign) return deny("The SVP can sign once the appraisal is finalised");
    if (input.opsDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.opsDate)) { await client.query("ROLLBACK"); return fail(400, "Use a date like 2026-12-20"); }

    const recs = { ...(a.recommendations ?? {}) } as Record<string, string[]>;
    if (input.hodTicks !== undefined) recs.hod = input.hodTicks;
    if (input.svpTicks !== undefined) recs.svp = input.svpTicks;

    const sets = ["recommendations = $2::jsonb", "updatedat = now()"];
    const params: unknown[] = [id, JSON.stringify(recs)];
    const set = (frag: string, v: unknown) => { params.push(v); sets.push(frag.replace("?", `$${params.length}`)); };
    if (input.opsName !== undefined) set("svpopsname = ?", input.opsName?.trim() || null);
    if (input.opsDate !== undefined) set("svpopsdate = ?", input.opsDate || null);
    if (input.svpSign) { sets.push("svpdeptsignedat = now()"); set("svpdeptsignedby = ?", session.staffId); }
    await client.query(`UPDATE kpi_appraisal SET ${sets.join(", ")} WHERE id = $1`, params);

    const what = [
      input.hodTicks !== undefined && "HOD recommendation", input.svpTicks !== undefined && "SVP recommendation",
      (input.opsName !== undefined || input.opsDate !== undefined) && "SVP-Operations", input.svpSign && "SVP-Department signature",
    ].filter(Boolean).join(", ");
    await insertAuditEntry(
      { entityName: "KPI_APPRAISAL", entityId: id, action: "Update", fieldName: "Sign-off", newValue: what || "No change", performedBy: session.staffId },
      client
    );
    await client.query("COMMIT");
    return done({ saved: true });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
