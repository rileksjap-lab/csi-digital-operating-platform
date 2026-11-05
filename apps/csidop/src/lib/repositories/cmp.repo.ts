import { query } from "@/lib/db/pool";
import type { AuthSession } from "@/lib/types/api";
import { insertAuditEntry } from "@/lib/db/audit";
import { conflict, notFound } from "@/lib/response";
import {
  validateSiblingWeights,
  type WeightValidationResult,
  computeItemScore,
  computePlannedScoreToday,
  computeVariance,
  computeRAG,
  rollupReadiness,
  type RAG,
  type EvidenceStatus,
} from "@/lib/cmp/calculations";

// SQL result rows below use direct camelCase column aliases
// (`weight AS "weight"`, `plan_id AS "planId"`) rather than the
// PascalCase-then-remap pattern in tender.repo.ts — CMP's own columns are
// already snake_case (see migration 033's naming note), so there's no
// existing PascalCase identifier to mirror; aliasing straight to the TS
// field name skips a redundant mapping function per entity.

// ─── Types ──────────────────────────────────────────────────────────────

export interface CmpPlan {
  id: string;
  planCode: string;
  name: string;
  baselineStatus: "Draft" | "Locked" | "Approved";
  lockedAt: string | null;
  lockedBy: string | null;
  createdAt: string;
}

export interface CmpHierarchyNode {
  id: string;
  code: string;
  name: string;
  weight: number;
  sortOrder: number;
}

export interface CmpWorkstream extends CmpHierarchyNode {
  planId: string;
  status: "Draft" | "Active";
  ownerRoleTitle: string | null;
  sponsorRoleTitle: string | null;
}

export interface CmpInitiative extends CmpHierarchyNode {
  workstreamId: string;
}

export interface CmpFactor extends CmpHierarchyNode {
  initiativeId: string;
}

export interface CmpItem {
  id: string;
  factorId: string;
  itemCode: string;
  name: string;
  weight: number;
  scoringMethod: "Stage" | "Binary" | "Approval" | "KPI" | "Manual";
  criticalGate: boolean;
  evidenceRequired: boolean;
  ownerRoleTitle: string;
  startDate: string | null;
  targetDate: string | null;
  baselinePeriodCode: string | null;
  notes: string | null;
}

export interface CmpItemUpdate {
  itemId: string;
  currentStatus: string | null;
  approvalStatus: string | null;
  kpiTarget: number | null;
  kpiActual: number | null;
  manualScore: number | null;
  manualScoreJustification: string | null;
  forecastDate: string | null;
  evidenceStatus: string;
  criticalBlocker: boolean;
  blockerIssue: string | null;
  supportRequired: string | null;
  remarks: string | null;
  updatedBy: string;
  updatedAt: string;
}

// ─── Plan ───────────────────────────────────────────────────────────────

export async function listPlans(): Promise<CmpPlan[]> {
  const result = await query<CmpPlan>(
    `SELECT id, plan_code AS "planCode", name,
            baseline_status AS "baselineStatus",
            locked_at AS "lockedAt", locked_by AS "lockedBy",
            created_at AS "createdAt"
     FROM cmp_plans ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function getPlanById(id: string): Promise<CmpPlan | null> {
  const result = await query<CmpPlan>(
    `SELECT id, plan_code AS "planCode", name,
            baseline_status AS "baselineStatus",
            locked_at AS "lockedAt", locked_by AS "lockedBy",
            created_at AS "createdAt"
     FROM cmp_plans WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createPlan(
  input: { planCode: string; name: string },
  session: AuthSession
): Promise<CmpPlan> {
  const result = await query<CmpPlan>(
    `INSERT INTO cmp_plans (plan_code, name, created_by)
     VALUES ($1, $2, $3)
     RETURNING id, plan_code AS "planCode", name,
               baseline_status AS "baselineStatus",
               locked_at AS "lockedAt", locked_by AS "lockedBy",
               created_at AS "createdAt"`,
    [input.planCode, input.name, session.staffId]
  );
  const plan = result.rows[0];
  await insertAuditEntry({
    entityName: "cmp_plans",
    entityId: plan.id,
    action: "Insert",
    performedBy: session.staffId,
  });
  return plan;
}

export async function updatePlan(
  id: string,
  patch: { name?: string },
  session: AuthSession
): Promise<CmpPlan> {
  const existing = await getPlanById(id);
  if (!existing) throw notFound("Plan not found");

  const result = await query<CmpPlan>(
    `UPDATE cmp_plans SET name = COALESCE($2, name), updated_at = now()
     WHERE id = $1
     RETURNING id, plan_code AS "planCode", name,
               baseline_status AS "baselineStatus",
               locked_at AS "lockedAt", locked_by AS "lockedBy",
               created_at AS "createdAt"`,
    [id, patch.name ?? null]
  );
  await insertAuditEntry({
    entityName: "cmp_plans",
    entityId: id,
    action: "Update",
    fieldName: "name",
    oldValue: existing.name,
    newValue: patch.name ?? existing.name,
    performedBy: session.staffId,
  });
  return result.rows[0];
}

// ─── Workstream ─────────────────────────────────────────────────────────

const WORKSTREAM_COLUMNS = `id, plan_id AS "planId", workstream_code AS "code", name,
  weight::float8 AS "weight", sort_order AS "sortOrder", status,
  owner_role_title AS "ownerRoleTitle", sponsor_role_title AS "sponsorRoleTitle"`;

export async function listWorkstreams(planId: string): Promise<CmpWorkstream[]> {
  const result = await query<CmpWorkstream>(
    `SELECT ${WORKSTREAM_COLUMNS} FROM cmp_workstreams WHERE plan_id = $1 ORDER BY sort_order, workstream_code`,
    [planId]
  );
  return result.rows;
}

export async function getWorkstreamById(id: string): Promise<CmpWorkstream | null> {
  const result = await query<CmpWorkstream>(
    `SELECT ${WORKSTREAM_COLUMNS} FROM cmp_workstreams WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createWorkstream(
  planId: string,
  input: { code: string; name: string; weight: number; sortOrder: number; ownerRoleTitle?: string; sponsorRoleTitle?: string },
  session: AuthSession
): Promise<CmpWorkstream> {
  const plan = await getPlanById(planId);
  if (!plan) throw notFound("Plan not found");
  if (plan.baselineStatus !== "Draft") throw conflict("Cannot add a workstream once the plan baseline is Locked or Approved — use a change request instead");

  const result = await query<CmpWorkstream>(
    `INSERT INTO cmp_workstreams (plan_id, workstream_code, name, weight, sort_order, owner_role_title, sponsor_role_title, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${WORKSTREAM_COLUMNS}`,
    [planId, input.code, input.name, input.weight, input.sortOrder, input.ownerRoleTitle ?? null, input.sponsorRoleTitle ?? null, session.staffId]
  );
  const ws = result.rows[0];
  await insertAuditEntry({ entityName: "cmp_workstreams", entityId: ws.id, action: "Insert", performedBy: session.staffId });
  return ws;
}

export async function updateWorkstream(
  id: string,
  patch: { name?: string; weight?: number; sortOrder?: number; ownerRoleTitle?: string; sponsorRoleTitle?: string; status?: "Draft" | "Active" },
  session: AuthSession
): Promise<CmpWorkstream> {
  const existing = await getWorkstreamById(id);
  if (!existing) throw notFound("Workstream not found");

  const result = await query<CmpWorkstream>(
    `UPDATE cmp_workstreams SET
       name = COALESCE($2, name), weight = COALESCE($3, weight),
       sort_order = COALESCE($4, sort_order),
       owner_role_title = COALESCE($5, owner_role_title),
       sponsor_role_title = COALESCE($6, sponsor_role_title),
       status = COALESCE($7, status), updated_at = now()
     WHERE id = $1
     RETURNING ${WORKSTREAM_COLUMNS}`,
    [id, patch.name ?? null, patch.weight ?? null, patch.sortOrder ?? null, patch.ownerRoleTitle ?? null, patch.sponsorRoleTitle ?? null, patch.status ?? null]
  );
  await insertAuditEntry({
    entityName: "cmp_workstreams", entityId: id, action: "Update",
    oldValue: JSON.stringify(existing), newValue: JSON.stringify(result.rows[0]),
    performedBy: session.staffId,
  });
  return result.rows[0];
}

export async function deleteWorkstream(id: string, session: AuthSession): Promise<void> {
  const existing = await getWorkstreamById(id);
  if (!existing) throw notFound("Workstream not found");
  await query(`DELETE FROM cmp_workstreams WHERE id = $1`, [id]);
  await insertAuditEntry({ entityName: "cmp_workstreams", entityId: id, action: "Delete", performedBy: session.staffId });
}

// ─── Initiative ─────────────────────────────────────────────────────────

const INITIATIVE_COLUMNS = `id, workstream_id AS "workstreamId", initiative_code AS "code", name, weight::float8 AS "weight", sort_order AS "sortOrder"`;

export async function listInitiatives(workstreamId: string): Promise<CmpInitiative[]> {
  const result = await query<CmpInitiative>(
    `SELECT ${INITIATIVE_COLUMNS} FROM cmp_initiatives WHERE workstream_id = $1 ORDER BY sort_order, initiative_code`,
    [workstreamId]
  );
  return result.rows;
}

export async function getInitiativeById(id: string): Promise<CmpInitiative | null> {
  const result = await query<CmpInitiative>(`SELECT ${INITIATIVE_COLUMNS} FROM cmp_initiatives WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createInitiative(
  workstreamId: string,
  input: { code: string; name: string; weight: number; sortOrder: number },
  session: AuthSession
): Promise<CmpInitiative> {
  const ws = await getWorkstreamById(workstreamId);
  if (!ws) throw notFound("Workstream not found");

  const result = await query<CmpInitiative>(
    `INSERT INTO cmp_initiatives (workstream_id, initiative_code, name, weight, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${INITIATIVE_COLUMNS}`,
    [workstreamId, input.code, input.name, input.weight, input.sortOrder, session.staffId]
  );
  const init = result.rows[0];
  await insertAuditEntry({ entityName: "cmp_initiatives", entityId: init.id, action: "Insert", performedBy: session.staffId });
  return init;
}

export async function updateInitiative(
  id: string,
  patch: { name?: string; weight?: number; sortOrder?: number },
  session: AuthSession
): Promise<CmpInitiative> {
  const existing = await getInitiativeById(id);
  if (!existing) throw notFound("Initiative not found");

  const result = await query<CmpInitiative>(
    `UPDATE cmp_initiatives SET name = COALESCE($2, name), weight = COALESCE($3, weight), sort_order = COALESCE($4, sort_order)
     WHERE id = $1 RETURNING ${INITIATIVE_COLUMNS}`,
    [id, patch.name ?? null, patch.weight ?? null, patch.sortOrder ?? null]
  );
  await insertAuditEntry({
    entityName: "cmp_initiatives", entityId: id, action: "Update",
    oldValue: JSON.stringify(existing), newValue: JSON.stringify(result.rows[0]), performedBy: session.staffId,
  });
  return result.rows[0];
}

export async function deleteInitiative(id: string, session: AuthSession): Promise<void> {
  const existing = await getInitiativeById(id);
  if (!existing) throw notFound("Initiative not found");
  await query(`DELETE FROM cmp_initiatives WHERE id = $1`, [id]);
  await insertAuditEntry({ entityName: "cmp_initiatives", entityId: id, action: "Delete", performedBy: session.staffId });
}

// ─── Factor ─────────────────────────────────────────────────────────────

const FACTOR_COLUMNS = `id, initiative_id AS "initiativeId", factor_code AS "code", name, weight::float8 AS "weight", sort_order AS "sortOrder"`;

export async function listFactors(initiativeId: string): Promise<CmpFactor[]> {
  const result = await query<CmpFactor>(
    `SELECT ${FACTOR_COLUMNS} FROM cmp_factors WHERE initiative_id = $1 ORDER BY sort_order, factor_code`,
    [initiativeId]
  );
  return result.rows;
}

export async function getFactorById(id: string): Promise<CmpFactor | null> {
  const result = await query<CmpFactor>(`SELECT ${FACTOR_COLUMNS} FROM cmp_factors WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createFactor(
  initiativeId: string,
  input: { code: string; name: string; weight: number; sortOrder: number },
  session: AuthSession
): Promise<CmpFactor> {
  const initiative = await getInitiativeById(initiativeId);
  if (!initiative) throw notFound("Initiative not found");

  const result = await query<CmpFactor>(
    `INSERT INTO cmp_factors (initiative_id, factor_code, name, weight, sort_order, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${FACTOR_COLUMNS}`,
    [initiativeId, input.code, input.name, input.weight, input.sortOrder, session.staffId]
  );
  const factor = result.rows[0];
  await insertAuditEntry({ entityName: "cmp_factors", entityId: factor.id, action: "Insert", performedBy: session.staffId });
  return factor;
}

export async function updateFactor(
  id: string,
  patch: { name?: string; weight?: number; sortOrder?: number },
  session: AuthSession
): Promise<CmpFactor> {
  const existing = await getFactorById(id);
  if (!existing) throw notFound("Factor not found");

  const result = await query<CmpFactor>(
    `UPDATE cmp_factors SET name = COALESCE($2, name), weight = COALESCE($3, weight), sort_order = COALESCE($4, sort_order)
     WHERE id = $1 RETURNING ${FACTOR_COLUMNS}`,
    [id, patch.name ?? null, patch.weight ?? null, patch.sortOrder ?? null]
  );
  await insertAuditEntry({
    entityName: "cmp_factors", entityId: id, action: "Update",
    oldValue: JSON.stringify(existing), newValue: JSON.stringify(result.rows[0]), performedBy: session.staffId,
  });
  return result.rows[0];
}

export async function deleteFactor(id: string, session: AuthSession): Promise<void> {
  const existing = await getFactorById(id);
  if (!existing) throw notFound("Factor not found");
  await query(`DELETE FROM cmp_factors WHERE id = $1`, [id]);
  await insertAuditEntry({ entityName: "cmp_factors", entityId: id, action: "Delete", performedBy: session.staffId });
}

// ─── Tracking Item ──────────────────────────────────────────────────────

const ITEM_COLUMNS = `id, factor_id AS "factorId", item_code AS "itemCode", name, weight::float8 AS "weight",
  scoring_method AS "scoringMethod", critical_gate AS "criticalGate",
  evidence_required AS "evidenceRequired", owner_role_title AS "ownerRoleTitle",
  start_date AS "startDate", target_date AS "targetDate",
  baseline_period_code AS "baselinePeriodCode", notes`;

export async function listItems(factorId: string): Promise<CmpItem[]> {
  const result = await query<CmpItem>(
    `SELECT ${ITEM_COLUMNS} FROM cmp_items WHERE factor_id = $1 ORDER BY item_code`,
    [factorId]
  );
  return result.rows;
}

export async function getItemById(id: string): Promise<CmpItem | null> {
  const result = await query<CmpItem>(`SELECT ${ITEM_COLUMNS} FROM cmp_items WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createItem(
  factorId: string,
  input: {
    itemCode: string; name: string; weight: number; scoringMethod: string;
    criticalGate: boolean; evidenceRequired: boolean; ownerRoleTitle: string;
    startDate?: string; targetDate?: string; baselinePeriodCode?: string; notes?: string;
  },
  session: AuthSession
): Promise<CmpItem> {
  const factor = await getFactorById(factorId);
  if (!factor) throw notFound("Factor not found");

  const result = await query<CmpItem>(
    `INSERT INTO cmp_items (factor_id, item_code, name, weight, scoring_method, critical_gate,
       evidence_required, owner_role_title, start_date, target_date, baseline_period_code, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${ITEM_COLUMNS}`,
    [
      factorId, input.itemCode, input.name, input.weight, input.scoringMethod,
      input.criticalGate, input.evidenceRequired, input.ownerRoleTitle,
      input.startDate ?? null, input.targetDate ?? null, input.baselinePeriodCode ?? null, input.notes ?? null,
      session.staffId,
    ]
  );
  const item = result.rows[0];

  // Every item needs a 1:1 progress row from day one (current_status starts
  // NULL / Not Started-equivalent) so /items/:id/update and /items/:id/score
  // never have to special-case "no row yet".
  await query(
    `INSERT INTO cmp_item_updates (item_id, evidence_status, updated_by) VALUES ($1, 'Not Required', $2)`,
    [item.id, session.staffId]
  );

  await insertAuditEntry({ entityName: "cmp_items", entityId: item.id, action: "Insert", performedBy: session.staffId });
  return item;
}

export async function updateItem(
  id: string,
  patch: Partial<{
    name: string; weight: number; scoringMethod: string; criticalGate: boolean;
    evidenceRequired: boolean; ownerRoleTitle: string; startDate: string | null;
    targetDate: string | null; baselinePeriodCode: string | null; notes: string | null;
  }>,
  session: AuthSession
): Promise<CmpItem> {
  const existing = await getItemById(id);
  if (!existing) throw notFound("Item not found");

  const result = await query<CmpItem>(
    `UPDATE cmp_items SET
       name = COALESCE($2, name), weight = COALESCE($3, weight),
       scoring_method = COALESCE($4, scoring_method), critical_gate = COALESCE($5, critical_gate),
       evidence_required = COALESCE($6, evidence_required), owner_role_title = COALESCE($7, owner_role_title),
       start_date = COALESCE($8, start_date), target_date = COALESCE($9, target_date),
       baseline_period_code = COALESCE($10, baseline_period_code), notes = COALESCE($11, notes),
       updated_at = now()
     WHERE id = $1 RETURNING ${ITEM_COLUMNS}`,
    [
      id, patch.name ?? null, patch.weight ?? null, patch.scoringMethod ?? null,
      patch.criticalGate ?? null, patch.evidenceRequired ?? null, patch.ownerRoleTitle ?? null,
      patch.startDate ?? null, patch.targetDate ?? null, patch.baselinePeriodCode ?? null, patch.notes ?? null,
    ]
  );
  await insertAuditEntry({
    entityName: "cmp_items", entityId: id, action: "Update",
    oldValue: JSON.stringify(existing), newValue: JSON.stringify(result.rows[0]), performedBy: session.staffId,
  });
  return result.rows[0];
}

export async function deleteItem(id: string, session: AuthSession): Promise<void> {
  const existing = await getItemById(id);
  if (!existing) throw notFound("Item not found");
  await query(`DELETE FROM cmp_items WHERE id = $1`, [id]);
  await insertAuditEntry({ entityName: "cmp_items", entityId: id, action: "Delete", performedBy: session.staffId });
}

// ─── Item progress (cmp_item_updates, 1:1 with cmp_items) ─────────────────

const ITEM_UPDATE_COLUMNS = `item_id AS "itemId", current_status AS "currentStatus",
  approval_status AS "approvalStatus", kpi_target::float8 AS "kpiTarget", kpi_actual::float8 AS "kpiActual",
  manual_score::float8 AS "manualScore", manual_score_justification AS "manualScoreJustification",
  forecast_date AS "forecastDate", evidence_status AS "evidenceStatus",
  critical_blocker AS "criticalBlocker", blocker_issue AS "blockerIssue",
  support_required AS "supportRequired", remarks, updated_by AS "updatedBy", updated_at AS "updatedAt"`;

export async function getItemUpdate(itemId: string): Promise<CmpItemUpdate | null> {
  const result = await query<CmpItemUpdate>(
    `SELECT ${ITEM_UPDATE_COLUMNS} FROM cmp_item_updates WHERE item_id = $1`,
    [itemId]
  );
  return result.rows[0] ?? null;
}

export async function upsertItemUpdate(
  itemId: string,
  patch: Partial<{
    currentStatus: string; approvalStatus: string; kpiTarget: number; kpiActual: number;
    manualScore: number; manualScoreJustification: string; forecastDate: string | null;
    evidenceStatus: string; criticalBlocker: boolean; blockerIssue: string | null;
    supportRequired: string | null; remarks: string | null;
  }>,
  session: AuthSession
): Promise<CmpItemUpdate> {
  const item = await getItemById(itemId);
  if (!item) throw notFound("Item not found");

  const existing = await getItemUpdate(itemId);

  // evidence_status and critical_blocker are NOT NULL on cmp_item_updates.
  // Postgres validates NOT NULL on the INSERT ... VALUES tuple before it
  // even checks for a conflict, so a bare $9/$10 here would fail whenever
  // a patch omits those fields -- even though ON CONFLICT DO UPDATE's own
  // COALESCE below would have handled it fine. In practice createItem()
  // always seeds a stub row first so this INSERT branch never really
  // fires, but the VALUES tuple still has to satisfy the column
  // constraints to be constructed at all -- default them in the VALUES
  // clause itself, independent of the UPDATE branch's COALESCE.
  const result = await query<CmpItemUpdate>(
    `INSERT INTO cmp_item_updates (item_id, current_status, approval_status, kpi_target, kpi_actual,
       manual_score, manual_score_justification, forecast_date, evidence_status, critical_blocker,
       blocker_issue, support_required, remarks, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'Not Required'), COALESCE($10, false), $11, $12, $13, $14)
     ON CONFLICT (item_id) DO UPDATE SET
       current_status = COALESCE($2, cmp_item_updates.current_status),
       approval_status = COALESCE($3, cmp_item_updates.approval_status),
       kpi_target = COALESCE($4, cmp_item_updates.kpi_target),
       kpi_actual = COALESCE($5, cmp_item_updates.kpi_actual),
       manual_score = COALESCE($6, cmp_item_updates.manual_score),
       manual_score_justification = COALESCE($7, cmp_item_updates.manual_score_justification),
       forecast_date = COALESCE($8, cmp_item_updates.forecast_date),
       evidence_status = COALESCE($9, cmp_item_updates.evidence_status),
       critical_blocker = COALESCE($10, cmp_item_updates.critical_blocker),
       blocker_issue = COALESCE($11, cmp_item_updates.blocker_issue),
       support_required = COALESCE($12, cmp_item_updates.support_required),
       remarks = COALESCE($13, cmp_item_updates.remarks),
       updated_by = $14, updated_at = now()
     RETURNING ${ITEM_UPDATE_COLUMNS}`,
    [
      itemId, patch.currentStatus ?? null, patch.approvalStatus ?? null,
      patch.kpiTarget ?? null, patch.kpiActual ?? null, patch.manualScore ?? null,
      patch.manualScoreJustification ?? null, patch.forecastDate ?? null,
      patch.evidenceStatus ?? null, patch.criticalBlocker ?? null,
      patch.blockerIssue ?? null, patch.supportRequired ?? null, patch.remarks ?? null,
      session.staffId,
    ]
  );
  await insertAuditEntry({
    entityName: "cmp_item_updates", entityId: itemId, action: existing ? "Update" : "Insert",
    oldValue: existing ? JSON.stringify(existing) : null, newValue: JSON.stringify(result.rows[0]),
    performedBy: session.staffId,
  });
  return result.rows[0];
}

export interface ItemWeightChain {
  itemWeight: number;
  factorWeight: number;
  initiativeWeight: number;
  workstreamWeight: number;
}

/** Full weight chain for one item, needed by computeOverallWeight (calculations.ts) — see /api/cmp/items/:id/score. */
export async function getItemWeightChain(itemId: string): Promise<ItemWeightChain | null> {
  const result = await query<ItemWeightChain>(
    `SELECT it.weight::float8 AS "itemWeight", f.weight::float8 AS "factorWeight",
            i.weight::float8 AS "initiativeWeight", w.weight::float8 AS "workstreamWeight"
     FROM cmp_items it
     JOIN cmp_factors f ON f.id = it.factor_id
     JOIN cmp_initiatives i ON i.id = f.initiative_id
     JOIN cmp_workstreams w ON w.id = i.workstream_id
     WHERE it.id = $1`,
    [itemId]
  );
  return result.rows[0] ?? null;
}

/**
 * True if this item has an open (non-Closed) Decision in cmp_issue_log,
 * linked via related_item_id, whose due_date has passed -- feeds
 * computeRAG's hasOverdueDecision (see that function's doc comment for
 * why this is a deliberate extension beyond the tracker's literal Excel
 * formula). Used by GET /api/cmp/items/:id/score for a single item.
 */
export async function hasOverdueDecision(itemId: string): Promise<boolean> {
  const result = await query<{ overdue: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM cmp_issue_log
       WHERE related_item_id = $1 AND type = 'Decision' AND status != 'Closed'
         AND due_date IS NOT NULL AND due_date < CURRENT_DATE
     ) AS overdue`,
    [itemId]
  );
  return result.rows[0]?.overdue ?? false;
}

/**
 * Same check as hasOverdueDecision, batched for every item in a plan at
 * once -- used by getPlanDashboard so it doesn't run one query per item.
 * Returns the set of item ids with at least one open, overdue, linked
 * Decision.
 */
export async function getOverdueDecisionItemIds(planId: string): Promise<Set<string>> {
  const result = await query<{ relatedItemId: string }>(
    `SELECT DISTINCT related_item_id AS "relatedItemId" FROM cmp_issue_log
     WHERE plan_id = $1 AND type = 'Decision' AND status != 'Closed'
       AND due_date IS NOT NULL AND due_date < CURRENT_DATE AND related_item_id IS NOT NULL`,
    [planId]
  );
  return new Set(result.rows.map((r) => r.relatedItemId));
}

export interface WorkstreamBlockerSummary {
  blockerIssue: string | null;
  supportRequired: string | null;
}

/**
 * Per-workstream "why is this row Red/Amber and what does management need
 * to do" text, for the Management Exception Dashboard section on CMP-04
 * (mirrors the deck's own slide 40 format literally: one row per
 * initiative with Planned/Actual/Readiness/RAG/Blocker-Issue/Support-
 * Required columns). Prefers an open (non-Closed) Issue/Blocker logged
 * against an item in that workstream; falls back to a critical-blocker
 * item's own blocker_issue/support_required text if no issue-log entry
 * exists yet. Real text pulled from real rows -- never fabricated, per
 * the "AI must not invent readiness/blockers" rule.
 */
export async function getWorkstreamBlockerSummaries(planId: string): Promise<Map<string, WorkstreamBlockerSummary>> {
  const [fromIssueLog, fromItemUpdates] = await Promise.all([
    query<{ workstreamId: string; description: string; supportRequired: string | null }>(
      `SELECT DISTINCT ON (w.id) w.id AS "workstreamId", il.description, il.support_required AS "supportRequired"
       FROM cmp_issue_log il
       JOIN cmp_items it ON it.id = il.related_item_id
       JOIN cmp_factors f ON f.id = it.factor_id
       JOIN cmp_initiatives i ON i.id = f.initiative_id
       JOIN cmp_workstreams w ON w.id = i.workstream_id
       WHERE w.plan_id = $1 AND il.type IN ('Issue', 'Blocker') AND il.status != 'Closed'
       ORDER BY w.id, il.severity DESC, il.opened_date DESC`,
      [planId]
    ),
    query<{ workstreamId: string; blockerIssue: string | null; supportRequired: string | null }>(
      `SELECT DISTINCT ON (w.id) w.id AS "workstreamId", u.blocker_issue AS "blockerIssue", u.support_required AS "supportRequired"
       FROM cmp_item_updates u
       JOIN cmp_items it ON it.id = u.item_id
       JOIN cmp_factors f ON f.id = it.factor_id
       JOIN cmp_initiatives i ON i.id = f.initiative_id
       JOIN cmp_workstreams w ON w.id = i.workstream_id
       WHERE w.plan_id = $1 AND u.critical_blocker = true
       ORDER BY w.id, u.updated_at DESC`,
      [planId]
    ),
  ]);

  const map = new Map<string, WorkstreamBlockerSummary>();
  for (const row of fromItemUpdates.rows) {
    map.set(row.workstreamId, { blockerIssue: row.blockerIssue, supportRequired: row.supportRequired });
  }
  // Issue-log entries take priority over the item-level fallback when both exist.
  for (const row of fromIssueLog.rows) {
    map.set(row.workstreamId, { blockerIssue: row.description, supportRequired: row.supportRequired });
  }
  return map;
}

// ─── Weight validation (TC01) & baseline lock/approve ──────────────────
// Per docs/cmp-transformation/10_solution_design.md section 2 and the
// 2026-07-31 review: validate at EVERY level (items under a factor, factors
// under an initiative, initiatives under a workstream, workstreams under
// the plan), not just the tracker's single global check.

export interface WeightGroupResult extends WeightValidationResult {
  level: "workstream" | "initiative" | "factor" | "item";
  parentId: string; // planId for workstream groups, else the parent node's id
  parentLabel: string;
}

export interface PlanWeightValidation {
  valid: boolean;
  groups: WeightGroupResult[];
}

export async function validatePlanWeights(planId: string): Promise<PlanWeightValidation> {
  const groups: WeightGroupResult[] = [];

  const workstreams = await listWorkstreams(planId);
  groups.push({
    level: "workstream",
    parentId: planId,
    parentLabel: "Plan",
    ...validateSiblingWeights(workstreams.map((w) => ({ id: w.id, weight: w.weight }))),
  });

  for (const ws of workstreams) {
    const initiatives = await listInitiatives(ws.id);
    groups.push({
      level: "initiative",
      parentId: ws.id,
      parentLabel: ws.name,
      ...validateSiblingWeights(initiatives.map((i) => ({ id: i.id, weight: i.weight }))),
    });

    for (const init of initiatives) {
      const factors = await listFactors(init.id);
      groups.push({
        level: "factor",
        parentId: init.id,
        parentLabel: init.name,
        ...validateSiblingWeights(factors.map((f) => ({ id: f.id, weight: f.weight }))),
      });

      for (const factor of factors) {
        const items = await listItems(factor.id);
        groups.push({
          level: "item",
          parentId: factor.id,
          parentLabel: factor.name,
          ...validateSiblingWeights(items.map((it) => ({ id: it.id, weight: it.weight }))),
        });
      }
    }
  }

  return { valid: groups.every((g) => g.valid), groups };
}

export async function lockBaseline(planId: string, session: AuthSession): Promise<CmpPlan> {
  const plan = await getPlanById(planId);
  if (!plan) throw notFound("Plan not found");
  if (plan.baselineStatus !== "Draft") throw conflict(`Plan baseline is already ${plan.baselineStatus}`);

  const validation = await validatePlanWeights(planId);
  if (!validation.valid) {
    throw conflict(
      `Baseline approval is blocked: sibling weights do not total 100% at ${validation.groups.filter((g) => !g.valid).length} level(s)`
    );
  }

  const result = await query<CmpPlan>(
    `UPDATE cmp_plans SET baseline_status = 'Locked', locked_at = now(), locked_by = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, plan_code AS "planCode", name, baseline_status AS "baselineStatus",
               locked_at AS "lockedAt", locked_by AS "lockedBy", created_at AS "createdAt"`,
    [planId, session.staffId]
  );
  await insertAuditEntry({
    entityName: "cmp_plans", entityId: planId, action: "StatusChange",
    oldValue: "Draft", newValue: "Locked", performedBy: session.staffId,
  });
  return result.rows[0];
}

export async function approveBaseline(planId: string, session: AuthSession): Promise<CmpPlan> {
  const plan = await getPlanById(planId);
  if (!plan) throw notFound("Plan not found");
  if (plan.baselineStatus !== "Locked") throw conflict("Plan baseline must be Locked before it can be Approved");

  const result = await query<CmpPlan>(
    `UPDATE cmp_plans SET baseline_status = 'Approved', updated_at = now()
     WHERE id = $1
     RETURNING id, plan_code AS "planCode", name, baseline_status AS "baselineStatus",
               locked_at AS "lockedAt", locked_by AS "lockedBy", created_at AS "createdAt"`,
    [planId]
  );
  await insertAuditEntry({
    entityName: "cmp_plans", entityId: planId, action: "StatusChange",
    oldValue: "Locked", newValue: "Approved", performedBy: session.staffId,
  });
  return result.rows[0];
}

// ─── Dashboard (TECH_02_SCORING_AND_RAG rules 6-9, "Readiness and RAG
// Dashboard" — required module 12 in the master prompt) ──────────────────
// Wires calculations.ts's rollup chain to real plan data: item score ->
// factor readiness -> initiative readiness -> workstream readiness ->
// Overall CMP Readiness, plus a RAG tally and Red/Amber exception list.
// Computed at read time, never stored (same rule as item-level scoring).

interface DashboardRow {
  workstreamId: string;
  workstreamName: string;
  workstreamWeight: number;
  workstreamSortOrder: number;
  initiativeId: string;
  initiativeWeight: number;
  factorId: string;
  factorWeight: number;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemWeight: number;
  scoringMethod: string;
  criticalGate: boolean;
  startDate: string | null;
  targetDate: string | null;
  currentStatus: string | null;
  approvalStatus: string | null;
  kpiTarget: number | null;
  kpiActual: number | null;
  manualScore: number | null;
  evidenceStatus: string | null;
  criticalBlocker: boolean | null;
  forecastDate: string | null;
}

export interface DashboardItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  workstreamName: string;
  score: number;
  rag: RAG;
  variance: number | null;
  criticalGate: boolean;
}

export interface DashboardWorkstream {
  workstreamId: string;
  workstreamName: string;
  weight: number;
  readiness: number;
  /** Rolled-up expected readiness "as of today" per each item's own baseline start/target dates — the plan-vs-actual reference point a management viewer needs to judge whether `readiness` is good or bad. */
  plannedReadiness: number;
  /** readiness - plannedReadiness. Negative = behind schedule, positive = ahead. */
  variance: number;
  ragCounts: { Red: number; Amber: number; Green: number };
  /** Worst RAG among this workstream's items (Red > Amber > Green) — the single status a management exception view puts in one row per workstream, matching the deck's "Management Exception Dashboard" slide format (one row per initiative: Planned/Actual/Readiness/RAG/Blocker/Support Required). */
  worstRag: RAG;
  /** Open (non-Closed) Issue/Blocker description linked to an item in this workstream, if any; falls back to a critical-blocker item's own blocker_issue text; null with no blocker at all (mirrors the deck's own Green-row example, "No critical blocker"). */
  blockerIssue: string | null;
  supportRequired: string | null;
}

export interface PlanDashboard {
  overallReadiness: number;
  /** Same rollup as overallReadiness, but using each item's plannedScoreToday instead of its actual score — "where the plan says we should be today." Items with no start/target date contribute 0 (not yet baselined = nothing planned yet), same convention as computePlannedScoreToday's own pre-start-date behavior. */
  overallPlannedReadiness: number;
  overallVariance: number;
  ragCounts: { Red: number; Amber: number; Green: number };
  /** Fraction of items (0-1) that have ANY owner-entered progress field set (status, approval, KPI actual, or manual score) — a real, honest substitute for a generic "data quality" KPI gauge: it answers "how much of this plan has anyone actually touched," distinct from readiness itself. */
  dataCompleteness: number;
  workstreams: DashboardWorkstream[];
  redItems: DashboardItem[];
  amberItems: DashboardItem[];
}

export async function getPlanDashboard(planId: string): Promise<PlanDashboard> {
  const [result, overdueDecisionItemIds, blockerSummaries] = await Promise.all([
    query<DashboardRow>(
    `SELECT
       w.id AS "workstreamId", w.name AS "workstreamName", w.weight::float8 AS "workstreamWeight",
       w.sort_order AS "workstreamSortOrder",
       i.id AS "initiativeId", i.weight::float8 AS "initiativeWeight",
       f.id AS "factorId", f.weight::float8 AS "factorWeight",
       it.id AS "itemId", it.item_code AS "itemCode", it.name AS "itemName", it.weight::float8 AS "itemWeight",
       it.scoring_method AS "scoringMethod", it.critical_gate AS "criticalGate",
       it.start_date AS "startDate", it.target_date AS "targetDate",
       u.current_status AS "currentStatus", u.approval_status AS "approvalStatus",
       u.kpi_target::float8 AS "kpiTarget", u.kpi_actual::float8 AS "kpiActual",
       u.manual_score::float8 AS "manualScore", u.evidence_status AS "evidenceStatus",
       u.critical_blocker AS "criticalBlocker", u.forecast_date AS "forecastDate"
     FROM cmp_workstreams w
     JOIN cmp_initiatives i ON i.workstream_id = w.id
     JOIN cmp_factors f ON f.initiative_id = i.id
     JOIN cmp_items it ON it.factor_id = f.id
     LEFT JOIN cmp_item_updates u ON u.item_id = it.id
     WHERE w.plan_id = $1`,
      [planId]
    ),
    getOverdueDecisionItemIds(planId),
    getWorkstreamBlockerSummaries(planId),
  ]);

  // Per-item score/RAG/variance, same math as GET /items/:id/score.
  const items = result.rows.map((row) => {
    const score = computeItemScore({
      scoringMethod: row.scoringMethod as never,
      currentStatus: row.currentStatus,
      approvalStatus: row.approvalStatus,
      kpiTarget: row.kpiTarget,
      kpiActual: row.kpiActual,
      manualScore: row.manualScore,
      evidenceStatus: row.evidenceStatus as EvidenceStatus | null,
    });

    // No baseline dates yet = nothing planned yet, same convention as
    // computePlannedScoreToday's own "today < start -> 0" behavior — an
    // un-dated item never drags the planned rollup down relative to what
    // it would read once dated, it just contributes nothing either way.
    const plannedScoreToday =
      row.startDate && row.targetDate
        ? computePlannedScoreToday(new Date(row.startDate), new Date(row.targetDate))
        : 0;
    const variance = row.startDate && row.targetDate ? computeVariance(score, plannedScoreToday) : null;

    const rag = computeRAG({
      criticalBlocker: row.criticalBlocker ?? false,
      forecastDate: row.forecastDate ? new Date(row.forecastDate) : null,
      targetDate: row.targetDate ? new Date(row.targetDate) : new Date("9999-12-31"),
      variance: variance ?? 0,
      hasOverdueDecision: overdueDecisionItemIds.has(row.itemId),
    });

    return { ...row, score, plannedScoreToday, rag, variance };
  });

  // Bottom-up rollup: item -> factor -> initiative -> workstream -> overall,
  // exactly the nested path calculations.ts's rollupReadiness doc-comment
  // describes (reconciled against the flattened overall_weight path in
  // calculations.acceptance.ts). Run twice with the same weights -- once
  // on actual score, once on plannedScoreToday -- so every level has a
  // plan-vs-actual reference point, not just a bare snapshot number.
  const byFactor = groupBy(items, (i) => i.factorId);
  const factorReadiness = new Map<string, number>();
  const factorPlanned = new Map<string, number>();
  for (const [factorId, factorItems] of byFactor) {
    factorReadiness.set(factorId, rollupReadiness(factorItems.map((i) => ({ value: i.score, weight: i.itemWeight }))));
    factorPlanned.set(factorId, rollupReadiness(factorItems.map((i) => ({ value: i.plannedScoreToday, weight: i.itemWeight }))));
  }

  const byInitiative = groupBy(items, (i) => i.initiativeId);
  const initiativeReadiness = new Map<string, number>();
  const initiativePlanned = new Map<string, number>();
  for (const [initiativeId, initiativeItems] of byInitiative) {
    const factorIds = [...new Set(initiativeItems.map((i) => i.factorId))];
    const weightOf = (fid: string) => initiativeItems.find((i) => i.factorId === fid)!.factorWeight;
    initiativeReadiness.set(
      initiativeId,
      rollupReadiness(factorIds.map((fid) => ({ value: factorReadiness.get(fid) ?? 0, weight: weightOf(fid) })))
    );
    initiativePlanned.set(
      initiativeId,
      rollupReadiness(factorIds.map((fid) => ({ value: factorPlanned.get(fid) ?? 0, weight: weightOf(fid) })))
    );
  }

  const byWorkstream = groupBy(items, (i) => i.workstreamId);
  const workstreams: DashboardWorkstream[] = [];
  for (const [workstreamId, wsItems] of byWorkstream) {
    const initiativeIds = [...new Set(wsItems.map((i) => i.initiativeId))];
    const weightOf = (iid: string) => wsItems.find((i) => i.initiativeId === iid)!.initiativeWeight;
    const readiness = rollupReadiness(
      initiativeIds.map((iid) => ({ value: initiativeReadiness.get(iid) ?? 0, weight: weightOf(iid) }))
    );
    const plannedReadiness = rollupReadiness(
      initiativeIds.map((iid) => ({ value: initiativePlanned.get(iid) ?? 0, weight: weightOf(iid) }))
    );
    const ragCounts = { Red: 0, Amber: 0, Green: 0 };
    for (const it of wsItems) ragCounts[it.rag]++;
    const worstRag: RAG = ragCounts.Red > 0 ? "Red" : ragCounts.Amber > 0 ? "Amber" : "Green";
    const blockerSummary = blockerSummaries.get(workstreamId);
    workstreams.push({
      workstreamId,
      workstreamName: wsItems[0].workstreamName,
      weight: wsItems[0].workstreamWeight,
      readiness,
      plannedReadiness,
      variance: readiness - plannedReadiness,
      ragCounts,
      worstRag,
      blockerIssue: blockerSummary?.blockerIssue ?? null,
      supportRequired: blockerSummary?.supportRequired ?? null,
    });
  }

  // Deck/Plan Setup order (WS01..WS11), not alphabetical -- New Co
  // Establishment (sort_order 1) leads the scorecard because it's the
  // foundation workstream everything else depends on, matching how the
  // plan is entered and read everywhere else in the app.
  const sortOrderByWorkstream = new Map(items.map((i) => [i.workstreamId, i.workstreamSortOrder]));
  workstreams.sort(
    (a, b) => (sortOrderByWorkstream.get(a.workstreamId) ?? 0) - (sortOrderByWorkstream.get(b.workstreamId) ?? 0)
  );

  const overallReadiness = rollupReadiness(workstreams.map((w) => ({ value: w.readiness, weight: w.weight })));
  const overallPlannedReadiness = rollupReadiness(workstreams.map((w) => ({ value: w.plannedReadiness, weight: w.weight })));

  const ragCounts = { Red: 0, Amber: 0, Green: 0 };
  for (const it of items) ragCounts[it.rag]++;

  const toDashboardItem = (i: (typeof items)[number]): DashboardItem => ({
    itemId: i.itemId,
    itemCode: i.itemCode,
    itemName: i.itemName,
    workstreamName: i.workstreamName,
    score: i.score,
    rag: i.rag,
    variance: i.variance,
    criticalGate: i.criticalGate,
  });

  const touchedCount = result.rows.filter(
    (r) => r.currentStatus != null || r.approvalStatus != null || r.kpiActual != null || r.manualScore != null
  ).length;
  const dataCompleteness = result.rows.length > 0 ? touchedCount / result.rows.length : 0;

  return {
    overallReadiness,
    overallPlannedReadiness,
    overallVariance: overallReadiness - overallPlannedReadiness,
    ragCounts,
    dataCompleteness,
    workstreams,
    redItems: items.filter((i) => i.rag === "Red").map(toDashboardItem),
    amberItems: items.filter((i) => i.rag === "Amber").map(toDashboardItem),
  };
}

// ─── S-Curve (Baseline vs Actual) — master deck slide 37 ──────────────────
// "Baseline plan, actual evidence and current forecast must be separated"
// (slide 37). No cmp_snapshots history exists yet (schema only, migration
// 035 -- no repo/route layer), so there is no real historical Actual data
// to plot; a fabricated multi-point Actual line would violate "AI must
// not invent readiness/progress." What IS real and computable without any
// snapshot history: the full Baseline curve, because computePlannedScoreToday
// already takes an arbitrary `asOf` date -- sampling it across the whole
// plan's date range produces a true deterministic baseline S-curve
// straight from real item weights/dates. Actual is reported honestly as a
// single point at today's real overall readiness, not a fabricated line.

export interface SCurvePoint {
  date: string; // YYYY-MM-DD
  plannedReadiness: number;
}

export interface PlanSCurve {
  planned: SCurvePoint[];
  actualToday: { date: string; readiness: number } | null;
}

const SCURVE_SAMPLE_COUNT = 24; // ~monthly across a 2-year span, coarser for longer spans

export async function getPlanSCurve(planId: string): Promise<PlanSCurve> {
  const rows = (
    await query<{
      workstreamWeight: number;
      initiativeWeight: number;
      factorWeight: number;
      itemWeight: number;
      startDate: string | null;
      targetDate: string | null;
    }>(
      `SELECT w.weight::float8 AS "workstreamWeight", i.weight::float8 AS "initiativeWeight",
              f.weight::float8 AS "factorWeight", it.weight::float8 AS "itemWeight",
              it.start_date AS "startDate", it.target_date AS "targetDate"
       FROM cmp_workstreams w
       JOIN cmp_initiatives i ON i.workstream_id = w.id
       JOIN cmp_factors f ON f.initiative_id = i.id
       JOIN cmp_items it ON it.factor_id = f.id
       WHERE w.plan_id = $1`,
      [planId]
    )
  ).rows;

  const dated = rows.filter((r) => r.startDate && r.targetDate);
  if (dated.length === 0) return { planned: [], actualToday: null };

  const minStart = Math.min(...dated.map((r) => new Date(r.startDate!).getTime()));
  const maxTarget = Math.max(...dated.map((r) => new Date(r.targetDate!).getTime()));

  const planned: SCurvePoint[] = [];
  const overallWeight = rows.reduce((sum, r) => sum + r.workstreamWeight * r.initiativeWeight * r.factorWeight * r.itemWeight, 0);
  for (let i = 0; i <= SCURVE_SAMPLE_COUNT; i++) {
    const sampleTime = minStart + ((maxTarget - minStart) * i) / SCURVE_SAMPLE_COUNT;
    const sampleDate = new Date(sampleTime);
    const value = rows.reduce((sum, r) => {
      const plannedToday =
        r.startDate && r.targetDate
          ? computePlannedScoreToday(new Date(r.startDate), new Date(r.targetDate), sampleDate)
          : 0;
      return sum + plannedToday * r.workstreamWeight * r.initiativeWeight * r.factorWeight * r.itemWeight;
    }, 0);
    planned.push({ date: sampleDate.toISOString().slice(0, 10), plannedReadiness: overallWeight > 0 ? value / overallWeight : 0 });
  }

  const dashboard = await getPlanDashboard(planId);
  return {
    planned,
    actualToday: { date: new Date().toISOString().slice(0, 10), readiness: dashboard.overallReadiness },
  };
}

// ─── Flat item list with progress (CMP-02 Progress Update) ────────────────
// The Progress Update screen originally built its list client-side by
// fan-out fetching workstreams -> initiatives -> factors -> items (~100
// requests for a 198-item plan), then had every row independently fetch
// its own /update and /score (another ~400 requests) -- ~500 requests on
// page load, which is genuinely slow and was part of what made the screen
// feel broken to a new user. This does the whole thing in one query, the
// same join+compute pattern getPlanDashboard already uses, just returning
// every item (not only Red/Amber ones) with its editable fields alongside
// the computed score/RAG.

export interface PlanItemWithProgress {
  itemId: string;
  itemCode: string;
  itemName: string;
  scoringMethod: string;
  criticalGate: boolean;
  evidenceRequired: boolean;
  contextLabel: string; // "Workstream / Factor" -- the Initiative level is hidden as of tracker v1.3 (one per workstream, always 100%)
  workstreamName: string;
  factorName: string;
  ownerRoleTitle: string;
  targetDate: string | null;
  currentStatus: string | null;
  approvalStatus: string | null;
  kpiTarget: number | null;
  kpiActual: number | null;
  manualScore: number | null;
  manualScoreJustification: string | null;
  forecastDate: string | null;
  evidenceStatus: string;
  criticalBlocker: boolean;
  score: number;
  rag: RAG;
  variance: number | null;
}

export async function getPlanItemsWithProgress(planId: string): Promise<PlanItemWithProgress[]> {
  const [result, overdueDecisionItemIds] = await Promise.all([
    query<{
      itemId: string;
      itemCode: string;
      itemName: string;
      scoringMethod: string;
      criticalGate: boolean;
      evidenceRequired: boolean;
      workstreamName: string;
      factorName: string;
      ownerRoleTitle: string;
      startDate: string | null;
      targetDate: string | null;
      currentStatus: string | null;
      approvalStatus: string | null;
      kpiTarget: number | null;
      kpiActual: number | null;
      manualScore: number | null;
      manualScoreJustification: string | null;
      forecastDate: string | null;
      evidenceStatus: string | null;
      criticalBlocker: boolean | null;
    }>(
      `SELECT
         it.id AS "itemId", it.item_code AS "itemCode", it.name AS "itemName",
         it.scoring_method AS "scoringMethod", it.critical_gate AS "criticalGate",
         it.evidence_required AS "evidenceRequired", it.start_date AS "startDate", it.target_date AS "targetDate",
         w.name AS "workstreamName", f.name AS "factorName", it.owner_role_title AS "ownerRoleTitle",
         u.current_status AS "currentStatus", u.approval_status AS "approvalStatus",
         u.kpi_target::float8 AS "kpiTarget", u.kpi_actual::float8 AS "kpiActual",
         u.manual_score::float8 AS "manualScore", u.manual_score_justification AS "manualScoreJustification",
         u.forecast_date AS "forecastDate", u.evidence_status AS "evidenceStatus", u.critical_blocker AS "criticalBlocker"
       FROM cmp_workstreams w
       JOIN cmp_initiatives i ON i.workstream_id = w.id
       JOIN cmp_factors f ON f.initiative_id = i.id
       JOIN cmp_items it ON it.factor_id = f.id
       LEFT JOIN cmp_item_updates u ON u.item_id = it.id
       WHERE w.plan_id = $1
       ORDER BY w.sort_order, w.workstream_code, it.item_code`,
      [planId]
    ),
    getOverdueDecisionItemIds(planId),
  ]);

  return result.rows.map((row) => {
    const score = computeItemScore({
      scoringMethod: row.scoringMethod as never,
      currentStatus: row.currentStatus,
      approvalStatus: row.approvalStatus,
      kpiTarget: row.kpiTarget,
      kpiActual: row.kpiActual,
      manualScore: row.manualScore,
      evidenceStatus: row.evidenceStatus as EvidenceStatus | null,
    });

    const plannedScoreToday =
      row.startDate && row.targetDate
        ? computePlannedScoreToday(new Date(row.startDate), new Date(row.targetDate))
        : 0;
    const variance = row.startDate && row.targetDate ? computeVariance(score, plannedScoreToday) : null;

    const rag = computeRAG({
      criticalBlocker: row.criticalBlocker ?? false,
      forecastDate: row.forecastDate ? new Date(row.forecastDate) : null,
      targetDate: row.targetDate ? new Date(row.targetDate) : new Date("9999-12-31"),
      variance: variance ?? 0,
      hasOverdueDecision: overdueDecisionItemIds.has(row.itemId),
    });

    return {
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      scoringMethod: row.scoringMethod,
      criticalGate: row.criticalGate,
      evidenceRequired: row.evidenceRequired,
      contextLabel: `${row.workstreamName} / ${row.factorName}`,
      workstreamName: row.workstreamName,
      factorName: row.factorName,
      ownerRoleTitle: row.ownerRoleTitle,
      targetDate: row.targetDate,
      currentStatus: row.currentStatus,
      approvalStatus: row.approvalStatus,
      kpiTarget: row.kpiTarget,
      kpiActual: row.kpiActual,
      manualScore: row.manualScore,
      manualScoreJustification: row.manualScoreJustification,
      forecastDate: row.forecastDate,
      evidenceStatus: row.evidenceStatus ?? "Not Required",
      criticalBlocker: row.criticalBlocker ?? false,
      score,
      rag,
      variance,
    };
  });
}

// ─── Issue / Decision / Blocker log (cmp_issue_log, migration 034) ────────

export interface CmpIssue {
  id: string;
  planId: string;
  logCode: string;
  type: "Issue" | "Decision" | "Blocker";
  relatedItemId: string | null;
  workstreamLabel: string | null;
  description: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  ownerRoleTitle: string;
  openedDate: string;
  dueDate: string | null;
  status: string;
  impact: string | null;
  supportRequired: string | null;
  decisionRequired: string | null;
  decisionOwnerRoleTitle: string | null;
  recoveryAction: string | null;
  closeDate: string | null;
}

const ISSUE_COLUMNS = `id, plan_id AS "planId", log_code AS "logCode", type,
  related_item_id AS "relatedItemId", workstream_label AS "workstreamLabel",
  description, severity, owner_role_title AS "ownerRoleTitle",
  opened_date AS "openedDate", due_date AS "dueDate", status,
  impact, support_required AS "supportRequired", decision_required AS "decisionRequired",
  decision_owner_role_title AS "decisionOwnerRoleTitle", recovery_action AS "recoveryAction",
  close_date AS "closeDate"`;

export async function listIssues(planId: string): Promise<CmpIssue[]> {
  const result = await query<CmpIssue>(
    `SELECT ${ISSUE_COLUMNS} FROM cmp_issue_log WHERE plan_id = $1 ORDER BY opened_date DESC, log_code DESC`,
    [planId]
  );
  return result.rows;
}

export async function getIssueById(id: string): Promise<CmpIssue | null> {
  const result = await query<CmpIssue>(`SELECT ${ISSUE_COLUMNS} FROM cmp_issue_log WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createIssue(
  planId: string,
  input: {
    type: string; relatedItemId?: string; workstreamLabel?: string; description: string;
    severity: string; ownerRoleTitle: string; dueDate?: string; impact?: string;
    supportRequired?: string; decisionRequired?: string; decisionOwnerRoleTitle?: string;
  },
  session: AuthSession
): Promise<CmpIssue> {
  const plan = await getPlanById(planId);
  if (!plan) throw notFound("Plan not found");

  // Sequential per-plan code (LOG001, LOG002, ...), matching the tracker's
  // own sample data (03_ISSUES_DECISIONS!LOG001). Not gapless/concurrency-
  // safe against a race (two simultaneous creates could collide on
  // uq_cmpissuelog_code) -- acceptable for this log's real usage pattern
  // (occasional manual entry, not high-frequency writes); a retry-on-
  // conflict would be the fix if that ever becomes a problem.
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM cmp_issue_log WHERE plan_id = $1`,
    [planId]
  );
  const nextNumber = parseInt(countResult.rows[0].count, 10) + 1;
  const logCode = `LOG${String(nextNumber).padStart(3, "0")}`;

  const result = await query<CmpIssue>(
    `INSERT INTO cmp_issue_log (plan_id, log_code, type, related_item_id, workstream_label,
       description, severity, owner_role_title, due_date, impact, support_required,
       decision_required, decision_owner_role_title, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING ${ISSUE_COLUMNS}`,
    [
      planId, logCode, input.type, input.relatedItemId ?? null, input.workstreamLabel ?? null,
      input.description, input.severity, input.ownerRoleTitle, input.dueDate ?? null,
      input.impact ?? null, input.supportRequired ?? null, input.decisionRequired ?? null,
      input.decisionOwnerRoleTitle ?? null, session.staffId,
    ]
  );
  const issue = result.rows[0];
  await insertAuditEntry({ entityName: "cmp_issue_log", entityId: issue.id, action: "Insert", performedBy: session.staffId });
  return issue;
}

export async function updateIssue(
  id: string,
  patch: Partial<{
    status: string; severity: string; dueDate: string | null; impact: string | null;
    supportRequired: string | null; decisionRequired: string | null;
    decisionOwnerRoleTitle: string | null; recoveryAction: string | null;
  }>,
  session: AuthSession
): Promise<CmpIssue> {
  const existing = await getIssueById(id);
  if (!existing) throw notFound("Issue not found");

  // chk_cmpissuelog_closedate requires close_date whenever status='Closed'
  // -- auto-stamp it here (today) rather than making the caller send it,
  // same pattern as lockBaseline stamping locked_at itself.
  const closeDate = patch.status === "Closed" && !existing.closeDate ? new Date().toISOString().slice(0, 10) : null;

  const result = await query<CmpIssue>(
    `UPDATE cmp_issue_log SET
       status = COALESCE($2, status), severity = COALESCE($3, severity),
       due_date = COALESCE($4, due_date), impact = COALESCE($5, impact),
       support_required = COALESCE($6, support_required),
       decision_required = COALESCE($7, decision_required),
       decision_owner_role_title = COALESCE($8, decision_owner_role_title),
       recovery_action = COALESCE($9, recovery_action),
       close_date = COALESCE($10, close_date)
     WHERE id = $1 RETURNING ${ISSUE_COLUMNS}`,
    [
      id, patch.status ?? null, patch.severity ?? null, patch.dueDate ?? null,
      patch.impact ?? null, patch.supportRequired ?? null, patch.decisionRequired ?? null,
      patch.decisionOwnerRoleTitle ?? null, patch.recoveryAction ?? null, closeDate,
    ]
  );
  await insertAuditEntry({
    entityName: "cmp_issue_log", entityId: id, action: "Update",
    oldValue: JSON.stringify(existing), newValue: JSON.stringify(result.rows[0]), performedBy: session.staffId,
  });
  return result.rows[0];
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) group.push(item);
    else map.set(key, [item]);
  }
  return map;
}
