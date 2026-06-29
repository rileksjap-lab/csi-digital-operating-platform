import { z } from "zod";

export const woListQuerySchema = z.object({
  status: z.string().optional(),
  domain: z.string().optional(),
  requestTypeId: z.string().uuid().optional(),
  tierId: z.string().uuid().optional(),
  tenderId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  dueDateFrom: z.string().date().optional(),
  dueDateTo: z.string().date().optional(),
  q: z.string().max(200).optional(),
  sourceType: z.enum(["external", "internal"]).optional(),
  sortBy: z
    .enum(["csiWoNo", "title", "priority", "dueDate", "status", "createdAt"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  after: z.string().optional(),
});

export type WoListQuery = z.infer<typeof woListQuerySchema>;

const WO_SOURCES = [
  "CMT", "CSA", "CPO", "CBA", "CST", "CSO", "CGI", "CSF",
  "CHO", "Legal", "Procurement", "CSI HOD", "Others",
] as const;

const PRIORITIES = ["Low", "Normal", "High", "Urgent", "Critical"] as const;
const PRIORITIES_WITH_NA = ["Low", "Normal", "High", "Urgent", "Critical", "N/A"] as const;

export const woCreateSchema = z.object({
  sourceOfWO: z.enum(WO_SOURCES),
  requesterName: z.string().max(150).optional(),
  requestTypeId: z.string().uuid(),
  tenderOrProjectCode: z.string().max(50).optional(),
  title: z.string().min(1).max(200),
  priorityInterdepart: z.enum(PRIORITIES).default("Normal"),
  priorityInternal: z.enum(PRIORITIES_WITH_NA).optional(),
  slaWorkingDays: z.number().int().positive().optional(),
  tierId: z.string().uuid(),
  complexityValue: z.number().nonnegative().optional(),
  monitoringStaffId: z.string().uuid().optional(),
  remark: z.string().max(2000).optional(),
  // External WO fields — optional for internal WOs
  extWoNo: z.string().max(30).optional(),
  projectCode: z.string().max(30).optional(),
  sourceDeptId: z.string().uuid().optional(),
  endUser: z.string().max(150).optional(),
  receivedDate: z.string().date().optional(),
  // Optional initial assignment
  assigneeId: z.string().uuid().optional(),
  assignedHours: z.number().positive().optional(),
  // Legacy fields kept for compatibility
  tenderId: z.string().uuid().optional(),
  indicativeValue: z.number().nonnegative().optional(),
  dueDate: z.string().date().optional(),
});

export type WoCreateInput = z.infer<typeof woCreateSchema>;

// ─── WO Task schemas ────────────────────────────────────────────────────────

export const woTaskCreateSchema = z.object({
  description: z.string().min(1).max(200),
  assignedTo: z.string().uuid().optional(),
  scope: z.enum(["Internal", "External"]).default("Internal"),
});

export type WoTaskCreateInput = z.infer<typeof woTaskCreateSchema>;

export const woTaskPatchSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  scope: z.enum(["Internal", "External"]).optional(),
  status: z.enum(["Active", "NA"]).optional(),
});

export type WoTaskPatchInput = z.infer<typeof woTaskPatchSchema>;

// ─── PATCH /api/wo/:id — update editable fields (FR-09) ─────────────────────

export const woPatchSchema = z.object({
  priority: z.enum(["Low", "Normal", "High", "Urgent", "Critical"]).optional(),
  priorityInternal: z.enum(["Low", "Normal", "High", "Urgent", "Critical", "N/A"]).nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
  tierId: z.string().uuid().optional(),
  requestTypeId: z.string().uuid().optional(),
  title: z.string().min(1).max(500).optional(),
  sourceOfWO: z.string().max(100).nullable().optional(),
  requesterName: z.string().max(200).nullable().optional(),
  remark: z.string().max(2000).nullable().optional(),
  slaWorkingDays: z.number().int().nullable().optional(),
  status: z.enum(["Open", "Acknowledged", "InProgress", "PendingApproval", "Approved", "Closed", "Returned", "Cancelled"]).optional(),
  tenderOrProjectCode: z.string().max(100).nullable().optional(),
  createdAt: z.string().datetime().optional(),
  amendReason: z.string().max(500).optional(),
});

export type WoPatchInput = z.infer<typeof woPatchSchema>;

// ─── POST /api/wo/:id/assign (FR-10–12) ─────────────────────────────────────

export const woAssignSchema = z.object({
  staffId: z.string().uuid(),
  assignedHours: z.number().positive(),
  reassignReason: z.string().min(1).max(500).optional(),
});

export type WoAssignInput = z.infer<typeof woAssignSchema>;

// ─── POST /api/wo/:id/complete (FR-31) ───────────────────────────────────────

export const woCompleteSchema = z.object({
  completionNote: z.string().max(500).optional(),
});

export type WoCompleteInput = z.infer<typeof woCompleteSchema>;

// ─── POST /api/wo/:id/approve (FR-33) ────────────────────────────────────────

export const woApproveSchema = z
  .object({
    decision: z.enum(["Approved", "Returned"]),
    reason: z.string().min(1).max(500).optional(),
  })
  .refine(
    (d) => {
      if (d.decision === "Returned") return !!d.reason;
      return true;
    },
    { message: "reason is required when returning a WO", path: ["reason"] }
  );

export type WoApproveInput = z.infer<typeof woApproveSchema>;

// ─── Effort Log schemas (FR-29–31) ──────────────────────────────────────────

export const effortCreateSchema = z.object({
  woId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  logDate: z.string().date(),
  hours: z.number().gt(0).lte(8),
  notes: z.string().max(500).optional(),
});

export type EffortCreateInput = z.infer<typeof effortCreateSchema>;

export const effortListQuerySchema = z.object({
  woId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
  logDateFrom: z.string().date().optional(),
  logDateTo: z.string().date().optional(),
  sortBy: z.enum(["logDate", "createdAt"]).default("logDate"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  after: z.string().optional(),
});

export type EffortListQuery = z.infer<typeof effortListQuerySchema>;

export const effortPatchSchema = z.object({
  hours: z.number().gt(0).lte(8).optional(),
  notes: z.string().max(500).optional(),
});

export type EffortPatchInput = z.infer<typeof effortPatchSchema>;

// ─── Evidence schemas (FR-30) ───────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
] as const;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export const evidenceUploadUrlSchema = z.object({
  woId: z.string().uuid(),
  filename: z.string().min(1).max(200),
  mimeType: z.string().refine((v) => (ALLOWED_MIME_TYPES as readonly string[]).includes(v), {
    message: "MIME type not allowed",
  }),
  fileSizeBytes: z.number().int().positive().max(MAX_FILE_SIZE, "File exceeds 25 MB limit"),
});

export type EvidenceUploadUrlInput = z.infer<typeof evidenceUploadUrlSchema>;

export const evidenceConfirmSchema = z.object({
  uploadIntentId: z.string().uuid(),
  evidenceType: z.string().min(1).max(50),
});

export type EvidenceConfirmInput = z.infer<typeof evidenceConfirmSchema>;

export const evidenceListQuerySchema = z.object({
  woId: z.string().uuid(),
  evidenceType: z.string().max(50).optional(),
});

export type EvidenceListQuery = z.infer<typeof evidenceListQuerySchema>;
