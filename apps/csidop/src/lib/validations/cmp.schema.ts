import { z } from "zod";

// ─── Plan ───────────────────────────────────────────────────────────────────

export const cmpPlanCreateSchema = z.object({
  planCode: z.string().min(1).max(30),
  name: z.string().min(1).max(200),
});
export type CmpPlanCreateInput = z.infer<typeof cmpPlanCreateSchema>;

export const cmpPlanPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });
export type CmpPlanPatchInput = z.infer<typeof cmpPlanPatchSchema>;

// ─── Workstream / Initiative / Factor — same shape at every level ─────────
// (source: 01_PLAN_SETUP — each level has code, name, weight, sort_order)

const hierarchyNodeCreate = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  weight: z.number().min(0).max(1),
  sortOrder: z.number().int().min(0).default(0),
});

const hierarchyNodePatch = z
  .object({
    name: z.string().min(1).max(200).optional(),
    weight: z.number().min(0).max(1).optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

export const cmpWorkstreamCreateSchema = hierarchyNodeCreate.extend({
  ownerRoleTitle: z.string().max(100).optional(),
  sponsorRoleTitle: z.string().max(100).optional(),
});
export type CmpWorkstreamCreateInput = z.infer<typeof cmpWorkstreamCreateSchema>;

export const cmpWorkstreamPatchSchema = hierarchyNodePatch.and(
  z.object({
    ownerRoleTitle: z.string().max(100).optional(),
    sponsorRoleTitle: z.string().max(100).optional(),
    status: z.enum(["Draft", "Active"]).optional(),
  }).partial()
);
export type CmpWorkstreamPatchInput = z.infer<typeof cmpWorkstreamPatchSchema>;

export const cmpInitiativeCreateSchema = hierarchyNodeCreate;
export type CmpInitiativeCreateInput = z.infer<typeof cmpInitiativeCreateSchema>;
export const cmpInitiativePatchSchema = hierarchyNodePatch;
export type CmpInitiativePatchInput = z.infer<typeof cmpInitiativePatchSchema>;

export const cmpFactorCreateSchema = hierarchyNodeCreate;
export type CmpFactorCreateInput = z.infer<typeof cmpFactorCreateSchema>;
export const cmpFactorPatchSchema = hierarchyNodePatch;
export type CmpFactorPatchInput = z.infer<typeof cmpFactorPatchSchema>;

// ─── Tracking Item (source: 01_PLAN_SETUP) ─────────────────────────────────

export const cmpItemCreateSchema = z.object({
  itemCode: z.string().min(1).max(20),
  name: z.string().min(1).max(300),
  weight: z.number().min(0).max(1),
  scoringMethod: z.enum(["Stage", "Binary", "Approval", "KPI", "Manual"]),
  criticalGate: z.boolean().default(false),
  evidenceRequired: z.boolean().default(false),
  ownerRoleTitle: z.string().min(1).max(100),
  startDate: z.string().date().optional(),
  targetDate: z.string().date().optional(),
  baselinePeriodCode: z.string().max(10).optional(),
  notes: z.string().optional(),
});
export type CmpItemCreateInput = z.infer<typeof cmpItemCreateSchema>;

export const cmpItemPatchSchema = z
  .object({
    name: z.string().min(1).max(300).optional(),
    weight: z.number().min(0).max(1).optional(),
    scoringMethod: z.enum(["Stage", "Binary", "Approval", "KPI", "Manual"]).optional(),
    criticalGate: z.boolean().optional(),
    evidenceRequired: z.boolean().optional(),
    ownerRoleTitle: z.string().min(1).max(100).optional(),
    startDate: z.string().date().optional().nullable(),
    targetDate: z.string().date().optional().nullable(),
    baselinePeriodCode: z.string().max(10).optional().nullable(),
    notes: z.string().optional().nullable(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });
export type CmpItemPatchInput = z.infer<typeof cmpItemPatchSchema>;

// ─── Item progress update (source: 02_PROGRESS_UPDATE, 1:1 with an item) ──
// Manual score requires a justification (chk_cmpitemupdates_manualjustification).

export const cmpItemUpdateSchema = z
  .object({
    currentStatus: z
      .enum([
        "Not Started",
        "Started",
        "Draft Completed",
        "Reviewed",
        "Approved and Evidenced",
        "Completed and Verified",
      ])
      .optional(),
    approvalStatus: z
      .enum(["Not Submitted", "Submitted", "Under Review", "Conditional Approval", "Approved"])
      .optional(),
    kpiTarget: z.number().optional(),
    kpiActual: z.number().optional(),
    manualScore: z.number().min(0).max(1).optional(),
    manualScoreJustification: z.string().min(1).optional(),
    forecastDate: z.string().date().optional().nullable(),
    evidenceStatus: z.enum(["Not Required", "Pending", "Submitted", "Verified"]).optional(),
    criticalBlocker: z.boolean().optional(),
    blockerIssue: z.string().optional().nullable(),
    supportRequired: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),
  })
  .refine((d) => d.manualScore === undefined || !!d.manualScoreJustification, {
    message: "manualScoreJustification is required whenever manualScore is set",
    path: ["manualScoreJustification"],
  });
export type CmpItemUpdateInput = z.infer<typeof cmpItemUpdateSchema>;

// ─── Issue / Decision / Blocker log (source: 03_ISSUES_DECISIONS) ─────────
// One unified log with a `type` discriminator, matching cmp_issue_log
// (migration 034) -- not three separate entities, per that migration's
// own comment on why.

export const cmpIssueCreateSchema = z.object({
  type: z.enum(["Issue", "Decision", "Blocker"]),
  relatedItemId: z.string().uuid().optional(),
  workstreamLabel: z.string().max(200).optional(),
  description: z.string().min(1),
  severity: z.enum(["Low", "Medium", "High", "Critical"]).default("Medium"),
  ownerRoleTitle: z.string().min(1).max(100),
  dueDate: z.string().date().optional(),
  impact: z.string().optional(),
  supportRequired: z.string().optional(),
  decisionRequired: z.string().optional(),
  decisionOwnerRoleTitle: z.string().max(100).optional(),
});
export type CmpIssueCreateInput = z.infer<typeof cmpIssueCreateSchema>;

export const cmpIssuePatchSchema = z
  .object({
    status: z.enum(["Open", "In Progress", "Closed"]).optional(),
    severity: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
    dueDate: z.string().date().optional().nullable(),
    impact: z.string().optional().nullable(),
    supportRequired: z.string().optional().nullable(),
    decisionRequired: z.string().optional().nullable(),
    decisionOwnerRoleTitle: z.string().max(100).optional().nullable(),
    recoveryAction: z.string().optional().nullable(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });
export type CmpIssuePatchInput = z.infer<typeof cmpIssuePatchSchema>;
