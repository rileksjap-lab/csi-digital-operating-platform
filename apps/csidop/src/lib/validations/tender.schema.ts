import { z } from "zod";

export const tenderListQuerySchema = z.object({
  status: z.string().optional(),
  category: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  closingDateFrom: z.string().date().optional(),
  closingDateTo: z.string().date().optional(),
  q: z.string().max(200).optional(),
  sortBy: z
    .enum([
      "tenderNo",
      "tenderName",
      "client",
      "closingDate",
      "estimatedValue",
      "status",
      "createdAt",
    ])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  after: z.string().optional(),
});

export type TenderListQuery = z.infer<typeof tenderListQuerySchema>;

export const tenderCreateSchema = z.object({
  tenderName: z.string().min(1).max(200),
  client: z.string().min(1).max(200),
  tenderCategory: z.string().max(100).optional(),
  closingDate: z.string().date(),
  estimatedValue: z.number().positive("Estimated value must be greater than 0"),
  submittedValue: z.number().nonnegative().optional(),
  tenderOwnerId: z.string().uuid(),
  status: z
    .enum([
      "Prospect",
      "Qualified",
      "InProgress",
      "Submitted",
      "Clarification",
      "Won",
      "Lost",
      "Cancelled",
    ])
    .default("Prospect"),
});

export type TenderCreateInput = z.infer<typeof tenderCreateSchema>;

// ─── PATCH /api/tender/:id — update tender fields ──────────────────────────

export const tenderPatchSchema = z
  .object({
    tenderName: z.string().min(1).max(200).optional(),
    client: z.string().min(1).max(200).optional(),
    tenderCategory: z.string().max(100).optional().nullable(),
    closingDate: z.string().date().optional(),
    estimatedValue: z.number().positive().optional(),
    submittedValue: z.number().nonnegative().optional().nullable(),
    winValue: z.number().nonnegative().optional().nullable(),
    tenderOwnerId: z.string().uuid().optional(),
    status: z
      .enum([
        "Prospect",
        "Qualified",
        "InProgress",
        "Submitted",
        "Clarification",
        "Won",
        "Lost",
        "Cancelled",
      ])
      .optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: "At least one field must be provided",
  });

export type TenderPatchInput = z.infer<typeof tenderPatchSchema>;

// ─── POST /api/tender/:id/score — create scoring + Go/No-Go evaluation ─────

const scoreCriterion = z.number().int().min(0).max(5);

export const tenderScoringSchema = z.object({
  functionalBreadth: scoreCriterion,
  integrationCount: scoreCriterion,
  complianceDepth: scoreCriterion,
  solutionNovelty: scoreCriterion,
  commercialComplexity: scoreCriterion,
  stakeholderIntensity: scoreCriterion,
  isRush: z.boolean().default(false),
  isConsortium: z.boolean().default(false),
  isSecurityHeavy: z.boolean().default(false),
  isCustomDev: z.boolean().default(false),
  isManyQA: z.boolean().default(false),
  isOnsite: z.boolean().default(false),
  planningHorizonDays: z.number().int().min(1).max(90).default(10),
});

export type TenderScoringInput = z.infer<typeof tenderScoringSchema>;

// ─── POST /api/tender/:id/gonogo/:goNoGoId/override ────────────────────────

export const gonogoOverrideSchema = z.object({
  overrideReason: z.string().min(1).max(500),
});

export type GoNoGoOverrideInput = z.infer<typeof gonogoOverrideSchema>;
