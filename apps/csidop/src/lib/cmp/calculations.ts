/**
 * CMP deterministic scoring / rollup / RAG engine.
 *
 * This module is the single source of truth for every CMP number CSIDOP
 * ever displays. Per TECH_00_DEVELOPER_README's "AI rule" — "AI may explain
 * and summarise; deterministic backend must calculate official scores" —
 * nothing here may be estimated, cached-and-drifted, or overridden by a
 * model. Every formula below is a literal port of the working Excel
 * formulas in
 * documents/CSI_CMP_Master_Tracker_v1.2_Execution_Ready_CSIDOP.xlsx
 * (sheets 01_PLAN_SETUP col S/T/U/V/W/X and TECH_02_SCORING_AND_RAG),
 * verified cell-by-cell, not paraphrased from the prose rules. Where the
 * literal Excel formula and the prose acceptance test
 * (TECH_03_ACCEPTANCE_TESTS) could be read two ways, the Excel formula
 * wins — see inline notes at computeItemScore and computeRAG.
 *
 * Values are never persisted (see migration 033's comment on cmp_items /
 * cmp_item_updates) — always computed at read time from cmp_items +
 * cmp_item_updates + the hierarchy's weight columns.
 */

// ── Types ───────────────────────────────────────────────────────────────

export type ScoringMethod = "Stage" | "Binary" | "Approval" | "KPI" | "Manual";

/** 02_PROGRESS_UPDATE!H — data-validation list, Stage method only. */
export type StageStatus =
  | "Not Started"
  | "Started"
  | "Draft Completed"
  | "Reviewed"
  | "Approved and Evidenced"
  | "Completed and Verified";

/** 02_PROGRESS_UPDATE!I — data-validation list, Approval method only. */
export type ApprovalStatus =
  | "Not Submitted"
  | "Submitted"
  | "Under Review"
  | "Conditional Approval"
  | "Approved";

/** 02_PROGRESS_UPDATE!N — data-validation list, all methods. */
export type EvidenceStatus = "Pending" | "Submitted" | "Verified" | "Rejected" | "Not Required";

export type RAG = "Red" | "Amber" | "Green";

export interface CmpItemUpdateInput {
  scoringMethod: ScoringMethod;
  /** Stage method: 02_PROGRESS_UPDATE!H */
  currentStatus?: StageStatus | "Completed and Verified" | string | null;
  /** Approval method: 02_PROGRESS_UPDATE!I */
  approvalStatus?: ApprovalStatus | string | null;
  /** KPI method: 02_PROGRESS_UPDATE!J (target) */
  kpiTarget?: number | null;
  /** KPI method: 02_PROGRESS_UPDATE!K (actual) */
  kpiActual?: number | null;
  /** Manual method: 02_PROGRESS_UPDATE!L, already a 0..1 fraction */
  manualScore?: number | null;
  /** 02_PROGRESS_UPDATE!N — gates the Stage method's top state (TC05) */
  evidenceStatus?: EvidenceStatus | null;
  /** 02_PROGRESS_UPDATE!O */
  criticalBlocker?: boolean;
  /** 02_PROGRESS_UPDATE!M — owner's current forecast; baseline target_date never changes (TC06) */
  forecastDate?: Date | null;
}

export interface CmpItemWeightInput {
  workstreamWeight: number;
  initiativeWeight: number;
  factorWeight: number;
  itemWeight: number;
}

// ── Item score (02_PROGRESS_UPDATE!S) ──────────────────────────────────

/**
 * Literal port of:
 *   =IF(F="Stage", SWITCH(H, "Not Started",0, "Started",0.25,
 *        "Draft Completed",0.5, "Reviewed",0.75,
 *        "Approved and Evidenced", IF(N="Verified",1,0.75), 0),
 *     IF(F="Binary", IF(H="Completed and Verified",1,0),
 *       IF(F="Approval", SWITCH(I, "Not Submitted",0, "Submitted",0.25,
 *            "Under Review",0.5, "Conditional Approval",0.75, "Approved",1, 0),
 *         IF(F="KPI", IFERROR(MIN(K/J,1),0),
 *           IF(F="Manual", MIN(L,1), 0)))))
 *
 * Note on TC05 ("Evidence required but not verified" -> item cannot reach
 * 100%): in the source formula this gate is wired only into the Stage
 * method's top state ("Approved and Evidenced" caps at 0.75 unless
 * evidence_status = "Verified"). Binary/Approval/KPI/Manual do not
 * reference evidence_status at all in the workbook. We replicate that
 * literally rather than generalising the gate to every method, per this
 * project's rule that the tracker's real formulas outrank prose
 * paraphrase when the two could be read two ways.
 */
export function computeItemScore(u: CmpItemUpdateInput): number {
  switch (u.scoringMethod) {
    case "Stage": {
      switch (u.currentStatus) {
        case "Not Started":
          return 0;
        case "Started":
          return 0.25;
        case "Draft Completed":
          return 0.5;
        case "Reviewed":
          return 0.75;
        case "Approved and Evidenced":
          return u.evidenceStatus === "Verified" ? 1 : 0.75;
        case "Completed and Verified":
          // Not in the Stage SWITCH's named branches in the source formula
          // (its default falls through to 0); Stage items top out at
          // "Approved and Evidenced". Kept explicit here rather than
          // silently returning 0 for what looks like a completion state.
          return 0;
        default:
          return 0;
      }
    }
    case "Binary":
      return u.currentStatus === "Completed and Verified" ? 1 : 0;
    case "Approval": {
      switch (u.approvalStatus) {
        case "Not Submitted":
          return 0;
        case "Submitted":
          return 0.25;
        case "Under Review":
          return 0.5;
        case "Conditional Approval":
          return 0.75;
        case "Approved":
          return 1;
        default:
          return 0;
      }
    }
    case "KPI": {
      const target = u.kpiTarget;
      const actual = u.kpiActual;
      if (!target || target === 0 || actual == null) return 0; // IFERROR(MIN(K/J,1),0)
      return Math.min(actual / target, 1);
    }
    case "Manual":
      return Math.min(u.manualScore ?? 0, 1);
    default:
      return 0;
  }
}

// ── Weight / contribution (01_PLAN_SETUP!U, 02_PROGRESS_UPDATE!S*T) ────

/** 01_PLAN_SETUP!U = D * G * J * L (workstream x initiative x factor x item weight). */
export function computeOverallWeight(w: CmpItemWeightInput): number {
  return w.workstreamWeight * w.initiativeWeight * w.factorWeight * w.itemWeight;
}

/** 02_PROGRESS_UPDATE!U = S * T (item score x overall weight). */
export function computeWeightedContribution(score: number, overallWeight: number): number {
  return score * overallWeight;
}

// ── Planned score today / variance (02_PROGRESS_UPDATE!V, W) ──────────

/**
 * Literal port of:
 *   =IF(TODAY()<start, 0, IF(TODAY()>=target, 1, (TODAY()-start)/(target-start)))
 * i.e. straight-line S-curve baseline between an item's start_date and
 * target_date (01_PLAN_SETUP!Q, R), clamped to [0,1].
 */
export function computePlannedScoreToday(startDate: Date, targetDate: Date, today: Date = new Date()): number {
  const t = today.getTime();
  const s = startDate.getTime();
  const e = targetDate.getTime();
  if (t < s) return 0;
  if (t >= e) return 1;
  if (e === s) return 1; // degenerate range guard (Excel would divide by zero here)
  return (t - s) / (e - s);
}

/** 02_PROGRESS_UPDATE!W = S - V (actual score minus planned score today). */
export function computeVariance(score: number, plannedScoreToday: number): number {
  return score - plannedScoreToday;
}

// ── RAG (02_PROGRESS_UPDATE!X) ─────────────────────────────────────────

export interface ComputeRagInput {
  criticalBlocker: boolean;
  /** owner's current forecast date (02_PROGRESS_UPDATE!M) */
  forecastDate?: Date | null;
  /** baseline target date (01_PLAN_SETUP!R) */
  targetDate: Date;
  variance: number;
  /**
   * True if this item has an open (non-Closed) Decision in cmp_issue_log,
   * linked via related_item_id, whose due_date has passed. Not present in
   * the tracker's own per-item Excel formula at all (that formula has no
   * way to reference a separate sheet's row from a single cell) but
   * explicitly named as a RAG-Red trigger in both TECH_02_SCORING_AND_RAG's
   * prose ("Overdue management decision") and the master prompt's RAG
   * LOGIC section -- a case where the Excel formula under-implements the
   * stated design rather than one where the formula and prose genuinely
   * disagree on behavior, so unlike TC05's evidence-gating nuance this is
   * treated as a real gap to close, not prose to discount in favor of the
   * literal cell formula. Caller resolves this by querying cmp_issue_log
   * (see cmp.repo.ts's getPlanDashboard / items/:id/score route).
   */
  hasOverdueDecision?: boolean;
  today?: Date;
}

/**
 * Literal port of:
 *   =IF(O="Yes","Red",
 *     IF(M > target+14, "Red",
 *       IF(W<-0.1,"Red", IF(W<-0.05,"Amber","Green"))))
 * plus one extension beyond the raw formula -- see hasOverdueDecision's
 * doc comment. critical_blocker forces Red; an open, overdue linked
 * Decision forces Red; a forecast slipping more than 14 days past the
 * baseline target forces Red; otherwise it's driven by variance
 * thresholds. RAG never touches the readiness score itself (TC04) — it is
 * purely an attention flag, computed independently and returned
 * alongside, never folded into computeItemScore/computeWeightedContribution.
 */
export function computeRAG(input: ComputeRagInput): RAG {
  if (input.criticalBlocker) return "Red";
  if (input.hasOverdueDecision) return "Red";

  if (input.forecastDate) {
    const overdueBy14Days = new Date(input.targetDate);
    overdueBy14Days.setDate(overdueBy14Days.getDate() + 14);
    if (input.forecastDate.getTime() > overdueBy14Days.getTime()) return "Red";
  }

  if (input.variance < -0.1) return "Red";
  if (input.variance < -0.05) return "Amber";
  return "Green";
}

// ── Weight validation (01_PLAN_SETUP!X5/X7, "siblings sum to 100%") ────

export interface WeightSibling {
  id: string;
  weight: number;
}

export interface WeightValidationResult {
  valid: boolean;
  total: number;
  siblingCount: number;
}

const WEIGHT_TOLERANCE = 0.0001; // matches ABS(X5-1)<0.0001 in the source formula

/**
 * Validates one sibling group (e.g. all workstreams under a plan, or all
 * items under one factor) sums to 100%.
 *
 * The tracker's own check (01_PLAN_SETUP!X7) only does this once, globally,
 * across all 198 item rows — a weaker check than what the source data
 * dictionary actually calls for ("Children must total 100%" at every
 * level, per TECH_01_DATA_DICTIONARY's Workstream Weight row). CSIDOP
 * implements the stronger per-level version: call this once per sibling
 * group at every level (items under a factor, factors under an
 * initiative, initiatives under a workstream, workstreams under a plan),
 * not just once globally.
 */
export function validateSiblingWeights(siblings: WeightSibling[]): WeightValidationResult {
  const total = siblings.reduce((sum, s) => sum + s.weight, 0);
  return {
    valid: Math.abs(total - 1) < WEIGHT_TOLERANCE,
    total,
    siblingCount: siblings.length,
  };
}

/**
 * TC01: "Sibling weights do not total 100%" -> "Baseline approval is
 * blocked." Call this across every sibling group in the plan before
 * allowing cmp_plans.baseline_status to move to 'Locked' or 'Approved'.
 */
export function canApproveBaseline(allSiblingGroups: WeightSibling[][]): boolean {
  return allSiblingGroups.every((group) => validateSiblingWeights(group).valid);
}

// ── Rollups (TECH_02_SCORING_AND_RAG rules 6-9) ────────────────────────

export interface WeightedNode {
  value: number; // readiness (0..1) of this node, or item score for leaves
  weight: number; // this node's weight among its siblings (0..1)
}

/**
 * Generic "sum of value x weight" rollup, used at every level:
 *   Factor Readiness      = sum(item.score x item.weight)
 *   Initiative Readiness  = sum(factor.readiness x factor.weight)
 *   Workstream Readiness  = sum(initiative.readiness x initiative.weight)
 *   Overall CMP Readiness = sum(workstream.readiness x workstream.weight)
 *
 * Because overall_weight (computeOverallWeight) already multiplies
 * workstream x initiative x factor x item weight together, Overall CMP
 * Readiness also equals sum(item.score x item.overallWeight) directly —
 * both paths must reconcile to the same number for a plan whose weights
 * all validate (see calculations.acceptance.ts, which checks this
 * identity, not just the individual TC scenarios).
 */
export function rollupReadiness(children: WeightedNode[]): number {
  return children.reduce((sum, c) => sum + c.value * c.weight, 0);
}

// ── Subsidiary / gate classification (TC07) ────────────────────────────

export type SubsidiaryStage = "Practice" | "Business Unit / Shadow P&L" | "Subsidiary Candidate" | "Legal Subsidiary";

/**
 * TC07: "Healthcare workstream readiness 80% but subsidiary gate not
 * approved" -> "Classified as subsidiary candidate, not legal subsidiary."
 *
 * Readiness percentage alone never promotes a workstream past
 * "Subsidiary Candidate" — a Legal Subsidiary classification requires the
 * workstream's designated critical_gate item(s) to all be Approved,
 * regardless of how high the weighted readiness number is. This mirrors
 * cmp_items.critical_gate (migration 033) and the "Critical Gate can
 * block readiness even at high %" rule.
 */
export function classifySubsidiaryStage(readiness: number, allCriticalGatesApproved: boolean): SubsidiaryStage {
  if (allCriticalGatesApproved && readiness >= 1) return "Legal Subsidiary";
  if (readiness >= 0.6) return "Subsidiary Candidate";
  if (readiness >= 0.25) return "Business Unit / Shadow P&L";
  return "Practice";
}
