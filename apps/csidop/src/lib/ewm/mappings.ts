// EWM's real DB-level status enum: Pending, In-Progress, Completed, Closed,
// Cancel, Open, Draft. CSIDOP's real DB-level status enum (chk_csiwo_status,
// 032_allow_cancelled_status.sql) is only: Open, InProgress, PendingApproval,
// Closed, OnHold, Cancelled. Values here are reference-only except "Cancel",
// which is the only EWM status this importer acts on directly (see
// applyEwmStatusChange in import.ts) — writing "Completed"/"Closed" straight
// to csi_wo.status would bypass CSI's own evidence/approval workflow.
export const EWM_STATUS_MAP: Record<string, string> = {
  Pending: "Open",
  Open: "Open",
  "In-Progress": "InProgress",
  Completed: "Closed",
  Closed: "Closed",
  Cancel: "Cancelled",
};

export const EWM_STATUS_SKIP = new Set(["Draft"]);

const CSIDOP_PRIORITIES = ["Low", "Normal", "High", "Urgent", "Critical"] as const;

const EWM_PRIORITY_MAP: Record<string, string> = {
  low: "Low",
  medium: "Normal",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
  critical: "Critical",
};

export function mapEwmPriority(raw: string | undefined): { value: string; wasUnmapped: boolean } {
  if (!raw) return { value: "Normal", wasUnmapped: false };
  const mapped = EWM_PRIORITY_MAP[raw.trim().toLowerCase()];
  if (mapped && (CSIDOP_PRIORITIES as readonly string[]).includes(mapped)) {
    return { value: mapped, wasUnmapped: false };
  }
  return { value: "Normal", wasUnmapped: true };
}

// Seeded from the 5 sample request_type strings EWM's admin provided
// (2026-07-20). None matched a CSIDOP TypeName exactly — this needs a
// developer's judgment call whenever EWM introduces a new value, not a
// self-serve admin table (see plan Decision #4). Unmapped values fall back
// to CSIDOP's "Others" TypeName in import.ts.
export const EWM_REQUEST_TYPE_MAP: Record<string, string> = {
  "Solution Documentation": "Documentation",
  "Project Implementation Support": "Project Monitoring",
  "Software Development - Project": "Others",
  Quotation: "Tender / RFP",
  "BIM Total Solution Presales": "BIM Presales Total Solution",
};

export const CSIDOP_FALLBACK_REQUEST_TYPE = "Others";
