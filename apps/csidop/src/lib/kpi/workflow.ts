// Appraisal workflow rules. Pure functions: who may do what at each step, what
// must be filled in before moving on, and who may see which ratings. The
// repository calls these before every write, so the rules live in one place.
//
//   SelfAssessment ──submitSelf──▶ SuperiorReview ──submitReview──▶ HODReview ──finalise──▶ Finalised ──sendToHR──▶ SentToHR
//        ▲                              │  ▲                            │                      │
//        └────────returnToStaff─────────┘  └──────returnToReviewer──────┘◀──────reopen────────┘
//        └─────withdraw (employee, only before the superior has started)─┘
//
// When the reviewer is also the final approver (the SVP for the HOD, or anyone
// who reports straight to the HOD), the HODReview step is skipped.

import { KRA_RATING_MAX, NO_EVIDENCE_RATING_CAP } from "@/lib/kpi/scoring";

export type AppraisalStatus = "SelfAssessment" | "SuperiorReview" | "HODReview" | "Finalised" | "SentToHR";
export type WorkflowAction =
  | "submitSelf" | "withdraw" | "withdrawAny" | "returnToStaff" | "submitReview" | "returnToReviewer" | "finalise" | "reopen" | "sendToHR";
export type Capacity = "Employee" | "Reviewer" | "FinalApprover";
export type Stage = "self" | "reviewer" | "final";

export interface WorkflowContext {
  status: AppraisalStatus;
  staffId: string;
  reviewerId: string;
  finalApproverId: string;
  /** Role code of the person being appraised (the HOD's own appraisal is not for a Solution Manager to edit). */
  staffRole?: string;
}

export interface Actor {
  staffId: string;
  /** The session role, e.g. "HOD", "SVP", "TeamLead". */
  role: string;
  /**
   * The HODs this person is currently acting for on this appraisal (the HOD names a
   * Solution Manager for set dates in KPI Setup). The repository fills it in; it is
   * empty for everyone else.
   */
  actingFor?: string[];
}

export const STATUS_LABEL: Record<AppraisalStatus, string> = {
  SelfAssessment: "Self-assessment",
  SuperiorReview: "Superior review",
  HODReview: "HOD review",
  Finalised: "Finalised",
  SentToHR: "Sent to HR",
};

/** An acting HOD stands in for the final approver, on anyone's appraisal but their own. */
export function actsForApprover(ctx: WorkflowContext, actor: Actor): boolean {
  return actor.staffId !== ctx.staffId && !!actor.actingFor?.includes(ctx.finalApproverId);
}

/** A person can be more than one of these on the same appraisal. */
export function capacities(ctx: WorkflowContext, actor: Actor): Set<Capacity> {
  const set = new Set<Capacity>();
  if (actor.staffId === ctx.staffId) set.add("Employee");
  if (actor.staffId === ctx.reviewerId) set.add("Reviewer");
  if (actor.staffId === ctx.finalApproverId) set.add("FinalApprover");
  if (actsForApprover(ctx, actor)) set.add("FinalApprover");
  return set;
}

/** The HOD and Solution Managers act department-wide. */
export const isManager = (actor: Actor) => actor.role === "HOD" || actor.role === "SolutionManager";

/**
 * The HOD and Solution Managers may change any part of any appraisal in their department
 * until it is sent to HR, whatever step it is at. Not their own, and a Solution Manager
 * leaves the HOD's appraisal alone.
 */
export function managerMayEdit(ctx: WorkflowContext, actor: Actor): boolean {
  if (!isManager(actor) || actor.staffId === ctx.staffId || ctx.status === "SentToHR") return false;
  return actor.role === "HOD" || ctx.staffRole !== "HOD";
}

const reviewerIsApprover = (ctx: WorkflowContext) => ctx.reviewerId === ctx.finalApproverId;

interface Transition {
  from: AppraisalStatus;
  /** "HrSender" = the HOD or the SVP (the HOD sends everyone, their own appraisal included).
   *  "Manager" = the HOD or a Solution Manager, for any appraisal in their department. */
  by: Capacity | "HrSender" | "Manager";
  to: (ctx: WorkflowContext) => AppraisalStatus;
  noteRequired: boolean;
  /** The stage whose ratings must be complete before this step. */
  needs?: Stage;
}

const TRANSITIONS: Record<WorkflowAction, Transition> = {
  submitSelf: { from: "SelfAssessment", by: "Employee", to: () => "SuperiorReview", noteRequired: false, needs: "self" },
  // The employee takes the submission back. The repository only allows it while the
  // superior has not started (see reviewerHasStarted), so nobody loses work.
  withdraw: { from: "SuperiorReview", by: "Employee", to: () => "SelfAssessment", noteRequired: false },
  // The HOD and Solution Managers can take any submission back, their own included, even after
  // the superior has started (the superior's ratings are kept). A reason is required when it is
  // someone else's; the repository enforces that.
  withdrawAny: { from: "SuperiorReview", by: "Manager", to: () => "SelfAssessment", noteRequired: false },
  returnToStaff: { from: "SuperiorReview", by: "Reviewer", to: () => "SelfAssessment", noteRequired: true },
  submitReview: {
    from: "SuperiorReview", by: "Reviewer", needs: "reviewer", noteRequired: false,
    to: (ctx) => (reviewerIsApprover(ctx) ? "Finalised" : "HODReview"),
  },
  returnToReviewer: { from: "HODReview", by: "FinalApprover", to: () => "SuperiorReview", noteRequired: true },
  finalise: { from: "HODReview", by: "FinalApprover", to: () => "Finalised", noteRequired: false, needs: "final" },
  reopen: {
    from: "Finalised", by: "FinalApprover", noteRequired: true,
    to: (ctx) => (reviewerIsApprover(ctx) ? "SuperiorReview" : "HODReview"),
  },
  sendToHR: { from: "Finalised", by: "HrSender", to: () => "SentToHR", noteRequired: false },
};

export type TransitionCheck =
  | { ok: true; to: AppraisalStatus; noteRequired: boolean; needs?: Stage }
  | { ok: false; reason: string };

export function checkTransition(action: WorkflowAction, ctx: WorkflowContext, actor: Actor): TransitionCheck {
  const t = TRANSITIONS[action];
  if (!t) return { ok: false, reason: "Unknown action" };
  if (ctx.status !== t.from) return { ok: false, reason: `This step is not available while the appraisal is "${STATUS_LABEL[ctx.status]}"` };

  const caps = capacities(ctx, actor);
  const allowed =
    t.by === "HrSender"
      ? actor.role === "HOD" || actor.role === "SVP"
      : t.by === "Manager"
        ? isManager(actor)
        : caps.has(t.by);
  if (!allowed) return { ok: false, reason: "You are not allowed to do this step on this appraisal" };
  return { ok: true, to: t.to(ctx), noteRequired: t.noteRequired, needs: t.needs };
}

export function allowedActions(ctx: WorkflowContext, actor: Actor): WorkflowAction[] {
  const all = (Object.keys(TRANSITIONS) as WorkflowAction[]).filter((a) => checkTransition(a, ctx, actor).ok);
  // A manager who is also the employee gets the manager version only, not two withdraw buttons.
  return all.includes("withdrawAny") ? all.filter((a) => a !== "withdraw") : all;
}

/** Which parts of the form this person may change right now. */
export function editable(ctx: WorkflowContext, actor: Actor) {
  const caps = capacities(ctx, actor);
  const manager = managerMayEdit(ctx, actor);
  return {
    self: ctx.status === "SelfAssessment" && caps.has("Employee"),
    reviewer: ctx.status === "SuperiorReview" && caps.has("Reviewer"),
    final: ctx.status === "HODReview" && caps.has("FinalApprover"),
    /** HOD / Solution Manager override: may edit every column, the certificates and the 1:1 until sent to HR. */
    manager,
    oneOnOne: (ctx.status === "SuperiorReview" && caps.has("Reviewer")) || manager,
    /** The employee confirms the 1:1 took place once it has been recorded. */
    acknowledge:
      caps.has("Employee") && (ctx.status === "SuperiorReview" || ctx.status === "HODReview"),
  };
}

/**
 * The sign-off part of the form: the HOD's and the SVP's career recommendation
 * ticks, the SVP-Operations name and date, and the SVP-Department signature.
 * Nobody signs off their own appraisal.
 */
export function signOffRights(ctx: WorkflowContext, actor: Actor) {
  const caps = capacities(ctx, actor);
  const others = actor.staffId !== ctx.staffId;
  const finalStep = ctx.status === "HODReview" || (ctx.status === "SuperiorReview" && reviewerIsApprover(ctx));
  const manager = managerMayEdit(ctx, actor);
  return {
    hodTicks: others && (manager || ((actor.role === "HOD" || actsForApprover(ctx, actor)) && caps.has("FinalApprover") && finalStep)),
    svpTicks: others && actor.role === "SVP" && (finalStep || ctx.status === "Finalised"),
    opsName: others && (manager || ((actor.role === "HOD" || actor.role === "SVP" || actsForApprover(ctx, actor)) && (finalStep || ctx.status === "Finalised"))),
    svpSign: others && actor.role === "SVP" && ctx.status === "Finalised",
  };
}

/**
 * Anyone in the chain may open the appraisal. The HOD and Solution Managers of the
 * department and the SVP can open every appraisal in their scope (the repository
 * decides `inScope`: same department for the HOD and Solution Managers, any for the SVP).
 */
export function canView(ctx: WorkflowContext, actor: Actor, inScope: boolean): boolean {
  if (capacities(ctx, actor).size > 0) return true;
  return inScope && (isManager(actor) || actor.role === "SVP");
}

/**
 * The person being appraised sees their own ratings, but not what the superior
 * or the HOD gave until the appraisal is finalised. Someone who is also the
 * reviewer or approver on the same appraisal sees everything.
 */
export function hidesOtherRatings(ctx: WorkflowContext, actor: Actor): boolean {
  const caps = capacities(ctx, actor);
  if (!caps.has("Employee") || caps.has("Reviewer") || caps.has("FinalApprover")) return false;
  return ctx.status !== "Finalised" && ctx.status !== "SentToHR";
}

/** The stage whose ratings make up the running total for a given status. */
export function stageForStatus(status: AppraisalStatus): Stage {
  if (status === "SelfAssessment") return "self";
  if (status === "SuperiorReview") return "reviewer";
  return "final";
}

// ── Completeness checks ─────────────────────────────────────────────────────

export interface LineMeta { id: string; name: string; evidenceRequired: boolean }
export interface ItemMeta { id: string; name: string; scaleMax: number; inputMode: "Rating" | "Certificates" }
export interface ScoreRow {
  lineId: string | null;
  itemId: string | null;
  selfRating: number | null; selfComment: string | null; selfEvidence: string | null;
  reviewerRating: number | null; reviewerComment: string | null; reviewerEvidence: string | null;
  finalRating: number | null; finalComment: string | null;
}

/** The superior has begun if they saved any rating, remark or evidence, or recorded the 1:1. */
export function reviewerHasStarted(rows: ScoreRow[], hasOneOnOne: boolean): boolean {
  return hasOneOnOne || rows.some((r) => r.reviewerRating !== null || filled(r.reviewerComment) || filled(r.reviewerEvidence));
}

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** The rating a stage works with, falling back to the earlier stage where the later one is untouched. */
export function ratingAt(row: ScoreRow, stage: Stage): number | null {
  if (stage === "self") return row.selfRating;
  if (stage === "reviewer") return row.reviewerRating ?? row.selfRating;
  return row.finalRating ?? row.reviewerRating ?? row.selfRating;
}

function hasEvidence(row: ScoreRow, stage: Stage): boolean {
  if (filled(row.selfEvidence)) return true;
  if (stage === "self") return false;
  if (filled(row.reviewerEvidence)) return true;
  return stage === "final" && filled(row.finalComment);
}

function ownRating(row: ScoreRow, stage: Stage): number | null {
  return stage === "self" ? row.selfRating : stage === "reviewer" ? row.reviewerRating : row.finalRating;
}

/** What is still missing or wrong before this stage can be submitted. Empty = ready. */
export function stageProblems(stage: Stage, lines: LineMeta[], items: ItemMeta[], rows: ScoreRow[]): string[] {
  const problems: string[] = [];
  const byLine = new Map(rows.filter((r) => r.lineId).map((r) => [r.lineId as string, r]));
  const byItem = new Map(rows.filter((r) => r.itemId).map((r) => [r.itemId as string, r]));

  for (const l of lines) {
    const row = byLine.get(l.id);
    const rating = row ? ownRating(row, stage) : null;
    if (!row || rating === null) { problems.push(`Rate "${l.name}"`); continue; }
    if (!Number.isInteger(rating) || rating < 1 || rating > KRA_RATING_MAX) { problems.push(`"${l.name}": rating must be 1 to ${KRA_RATING_MAX}`); continue; }
    if (l.evidenceRequired && rating > NO_EVIDENCE_RATING_CAP && !hasEvidence(row, stage)) {
      problems.push(`"${l.name}": a rating above ${NO_EVIDENCE_RATING_CAP} needs supporting evidence`);
    }
    if (stage === "final" && row.reviewerRating !== null && rating !== row.reviewerRating && !filled(row.finalComment)) {
      problems.push(`"${l.name}": give a reason for changing the superior's rating`);
    }
  }
  for (const i of items) {
    if (i.inputMode === "Certificates") continue; // calculated from the certificate list
    const row = byItem.get(i.id);
    const rating = row ? ownRating(row, stage) : null;
    if (!row || rating === null) { problems.push(`Score "${i.name}"`); continue; }
    if (!Number.isInteger(rating) || rating < 1 || rating > i.scaleMax) { problems.push(`"${i.name}": score must be 1 to ${i.scaleMax}`); continue; }
    if (stage === "final" && row.reviewerRating !== null && rating !== row.reviewerRating && !filled(row.finalComment)) {
      problems.push(`"${i.name}": give a reason for changing the superior's score`);
    }
  }
  return problems;
}
