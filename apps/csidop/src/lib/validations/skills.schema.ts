import { z } from "zod";

// ─── Skill inventory ────────────────────────────────────────────────────────

const TECHNOLOGY_DOMAINS = [
  "Cloud",
  "Cyber Security",
  "Data Centre",
  "Network",
  "Enterprise Architecture",
  "AI / HPC",
  "BIM",
  "Consultancy",
] as const;

export const skillCreateSchema = z.object({
  skillName: z.string().min(1).max(100),
  technologyDomain: z.enum(TECHNOLOGY_DOMAINS),
});

export const skillListQuerySchema = z.object({
  domain: z.enum(TECHNOLOGY_DOMAINS).optional(),
});

// ─── Staff skill (competency assessment) ────────────────────────────────────

const COMPETENCY_LEVELS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Expert",
] as const;

export const assessmentUpsertSchema = z.object({
  staffId: z.string().uuid(),
  skillId: z.string().uuid(),
  competencyLevel: z.enum(COMPETENCY_LEVELS),
  lastAssessmentDate: z.string().date().refine(
    (d) => new Date(d) <= new Date(),
    "Assessment date cannot be in the future"
  ),
});

export const assessmentListQuerySchema = z.object({
  staffId: z.string().uuid().optional(),
  domain: z.enum(TECHNOLOGY_DOMAINS).optional(),
});

// ─── Certification ──────────────────────────────────────────────────────────

const CERT_STATUSES = ["Unverified", "Verified", "Expired"] as const;

export const certificationCreateSchema = z
  .object({
    certificationName: z.string().min(1).max(150),
    vendor: z.string().max(100).optional(),
    certificationLevel: z.string().max(50).optional(),
    issueDate: z.string().date(),
    expiryDate: z.string().date().optional(),
  })
  .refine(
    (d) => !d.expiryDate || new Date(d.expiryDate) > new Date(d.issueDate),
    { message: "Expiry date must be after issue date", path: ["expiryDate"] }
  );

export const certificationListQuerySchema = z.object({
  status: z.enum(CERT_STATUSES).optional(),
  vendor: z.string().max(100).optional(),
  staffId: z.string().uuid().optional(),
  expiringWithinDays: z.coerce.number().int().min(1).max(365).optional(),
});

// ─── Training plan ──────────────────────────────────────────────────────────

const TRAINING_STATUSES = [
  "Planned",
  "InProgress",
  "Completed",
  "Cancelled",
] as const;

export const trainingCreateSchema = z
  .object({
    staffId: z.string().uuid(),
    skillId: z.string().uuid().optional(),
    certificationId: z.string().uuid().optional(),
    plannedActivity: z.string().min(1).max(200),
    targetDate: z.string().date().optional(),
  })
  .refine(
    (d) =>
      (d.skillId && !d.certificationId) ||
      (!d.skillId && d.certificationId),
    {
      message: "Exactly one of skillId or certificationId must be provided",
      path: ["skillId"],
    }
  );

export const trainingPatchSchema = z.object({
  status: z.enum(TRAINING_STATUSES).optional(),
  plannedActivity: z.string().min(1).max(200).optional(),
  targetDate: z.string().date().optional(),
});

export const trainingListQuerySchema = z.object({
  staffId: z.string().uuid().optional(),
  status: z.enum(TRAINING_STATUSES).optional(),
});
