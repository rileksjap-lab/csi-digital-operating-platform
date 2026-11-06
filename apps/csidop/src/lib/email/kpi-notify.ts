import { APP_URL, field, getStaffEmail, send, wrap } from "@/lib/email/notify";
import { createNotification } from "@/lib/repositories/notification.repo";
import type { AppraisalStatus, WorkflowAction } from "@/lib/kpi/workflow";

// Email + in-app bell for the KPI appraisal. Only the steps where somebody has
// to act (or has been told something) send anything. The mail never carries
// scores or comments, only who did what and, when a step was sent back, why.

export interface KpiNotifyFacts {
  appraisalId: string;
  action: WorkflowAction;
  /** Status the appraisal moved to. */
  to: AppraisalStatus;
  /** Who clicked the button. */
  actorId: string;
  actorName: string;
  staffId: string;
  staffName: string;
  reviewerId: string;
  finalApproverId: string;
  /** The Solution Manager covering for the HOD today, if the cover is switched on and in date. */
  coverId: string | null;
  reason: string | null;
}

export type KpiMessageKind = "needsReview" | "needsFinal" | "returnedToStaff" | "returnedToReviewer" | "finalised" | "withdrawn";

export interface KpiRecipient { staffId: string; kind: KpiMessageKind }

/** Who should hear about this step. Pure, so it can be checked without a database. */
export function kpiRecipients(f: KpiNotifyFacts): KpiRecipient[] {
  const out: KpiRecipient[] = [];
  const add = (staffId: string | null | undefined, kind: KpiMessageKind) => {
    if (!staffId || staffId === f.actorId) return; // never tell people about their own click
    if (out.some((o) => o.staffId === staffId)) return;
    out.push({ staffId, kind });
  };
  // The HOD and, while the cover is on, the Solution Manager both hear about the HOD's steps.
  const addFinalApprovers = (kind: KpiMessageKind) => { add(f.finalApproverId, kind); add(f.coverId, kind); };

  switch (f.action) {
    case "submitSelf":
      add(f.reviewerId, "needsReview");
      if (f.reviewerId === f.finalApproverId) add(f.coverId, "needsReview"); // the HOD is the superior here
      break;
    case "submitReview":
      if (f.to === "HODReview") addFinalApprovers("needsFinal");
      break;
    case "returnToStaff": add(f.staffId, "returnedToStaff"); break;
    case "returnToReviewer": add(f.reviewerId, "returnedToReviewer"); break;
    case "finalise": add(f.staffId, "finalised"); break;
    case "withdrawAny": add(f.staffId, "withdrawn"); break; // skipped automatically when they withdrew their own
    default: break; // withdraw (own), reopen, sendToHR: nobody to tell
  }
  // A review that is also the final step (the superior is the final approver) finalises it.
  if (f.to === "Finalised" && f.action !== "finalise") add(f.staffId, "finalised");
  return out;
}

function message(kind: KpiMessageKind, f: KpiNotifyFacts): { subject: string; heading: string; lead: string; button: string; category: string } {
  const who = f.actorName;
  switch (kind) {
    case "needsReview":
      return { subject: `KPI appraisal to review: ${f.staffName}`, heading: "KPI appraisal ready for your review",
        lead: `<strong>${f.staffName}</strong> has submitted their KPI appraisal. Please review it and record the 1:1.`, button: "Open appraisal", category: "KPI" };
    case "needsFinal":
      return { subject: `KPI appraisal ready for final review: ${f.staffName}`, heading: "KPI appraisal ready for final review",
        lead: `<strong>${who}</strong> has finished the review of <strong>${f.staffName}</strong>. It is waiting for the final review.`, button: "Open appraisal", category: "KPI" };
    case "returnedToStaff":
      return { subject: "Your KPI appraisal was returned", heading: "Your KPI appraisal was returned",
        lead: `<strong>${who}</strong> has returned your KPI appraisal. Please update it and submit again.`, button: "Open my appraisal", category: "KPI" };
    case "returnedToReviewer":
      return { subject: `KPI appraisal returned to you: ${f.staffName}`, heading: "KPI appraisal returned to you",
        lead: `<strong>${who}</strong> has returned the review of <strong>${f.staffName}</strong> to you.`, button: "Open appraisal", category: "KPI" };
    case "finalised":
      return { subject: "Your KPI appraisal is finalised", heading: "Your KPI appraisal is finalised",
        lead: `<strong>${who}</strong> has finalised your KPI appraisal. You can now open it to see the result.`, button: "Open my appraisal", category: "KPI" };
    case "withdrawn":
      return { subject: "Your KPI submission was withdrawn", heading: "Your KPI submission was withdrawn",
        lead: `<strong>${who}</strong> has withdrawn your KPI submission. You can edit it and submit again.`, button: "Open my appraisal", category: "KPI" };
  }
}

/** Fire-and-forget: a mail problem must never undo or fail the workflow step. */
export function notifyKpiStep(f: KpiNotifyFacts): void {
  (async () => {
    const link = `/kpi/appraisals/${f.appraisalId}`;
    for (const r of kpiRecipients(f)) {
      const m = message(r.kind, f);
      createNotification({ staffId: r.staffId, title: m.heading, body: r.kind === "needsReview" || r.kind === "needsFinal" || r.kind === "returnedToReviewer" ? f.staffName : undefined, category: m.category, linkUrl: link })
        .catch((e) => console.error("[kpi-notify] in-app failed", e));
      const email = await getStaffEmail(r.staffId);
      if (!email) continue;
      const reasonRow = f.reason && (r.kind === "returnedToStaff" || r.kind === "returnedToReviewer" || r.kind === "withdrawn")
        ? `<table style="border-collapse:collapse;margin:12px 0;">${field("Reason", escapeHtml(f.reason))}</table>` : "";
      await send(email, m.subject, wrap(m.heading, `
        <p style="color:#374151;font-size:14px;margin:0 0 12px;">${m.lead}</p>
        ${reasonRow}
        <a href="${APP_URL}${link}" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin:8px 0;">${m.button}</a>
      `));
    }
  })().catch((e) => console.error("[kpi-notify] failed", e));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
