import { APP_URL, field, getStaffEmail, send, wrap } from "@/lib/email/notify";
import { query } from "@/lib/db/pool";
import { createNotification } from "@/lib/repositories/notification.repo";
import { localTodayIso } from "@/lib/dates";
import type { LeaveStatus } from "@/lib/leave/rules";

// Email + bell for leave: tell the person who has to act, and tell the requester how it went.

export type LeaveEventKind = "submitted" | "needsHod" | "approved" | "rejected" | "cancelled";

export interface LeaveNotifyFacts {
  kind: LeaveEventKind;
  requestId: string;
  status: LeaveStatus;
  requesterId: string;
  requesterName: string;
  deptId: string;
  typeName: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  coverStaffId: string | null;
  actorId: string;
  actorName: string;
  /** The approver's note (always present on a rejection). */
  note: string | null;
  /** True when a cancel is taking back leave that was already approved. */
  wasApproved?: boolean;
}

type Msg = "needsSM" | "needsHod" | "approved" | "rejected" | "cancelledByOther" | "cancelledApproved" | "covering";
export interface LeaveRecipient { staffId: string; msg: Msg }

async function ids(deptId: string, roleCode: "SM" | "HOD"): Promise<string[]> {
  const r = await query<{ id: string }>(
    `SELECT s.id FROM staff s JOIN role r ON r.id = s.roleid WHERE s.deptid = $1 AND r.rolecode = $2 AND s.status = 'Active'`, [deptId, roleCode]);
  return r.rows.map((x) => x.id);
}

async function actingApproverToday(): Promise<string | null> {
  const r = await query<{ value: { staffId: string; from: string; to: string } }>(`SELECT value FROM leave_setting WHERE key = 'actingApprover'`);
  const a = r.rows[0]?.value;
  const today = localTodayIso();
  return a && a.from <= today && today <= a.to ? a.staffId : null;
}

/** Who hears about this step, and what they are told. Never the person who clicked. */
export async function leaveRecipients(f: LeaveNotifyFacts): Promise<LeaveRecipient[]> {
  const out: LeaveRecipient[] = [];
  const add = (staffId: string | null | undefined, msg: Msg) => {
    if (!staffId || staffId === f.actorId || out.some((o) => o.staffId === staffId)) return;
    out.push({ staffId, msg });
  };
  const hodSide = async (msg: Msg) => { for (const id of await ids(f.deptId, "HOD")) add(id, msg); add(await actingApproverToday(), msg); };

  if (f.kind === "submitted") {
    if (f.status === "PendingSM") for (const id of await ids(f.deptId, "SM")) add(id, "needsSM");
    else if (f.status === "PendingHOD") await hodSide("needsHod");
  } else if (f.kind === "needsHod") {
    await hodSide("needsHod");
  } else if (f.kind === "approved") {
    add(f.requesterId, "approved");
    add(f.coverStaffId, "covering");
  } else if (f.kind === "rejected") {
    add(f.requesterId, "rejected");
  } else if (f.kind === "cancelled") {
    if (f.actorId !== f.requesterId) add(f.requesterId, "cancelledByOther");
    else if (f.wasApproved) { await hodSide("cancelledApproved"); for (const id of await ids(f.deptId, "SM")) add(id, "cancelledApproved"); }
  }
  return out;
}

const range = (f: LeaveNotifyFacts) => (f.startDate === f.endDate ? f.startDate : `${f.startDate} to ${f.endDate}`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function message(m: Msg, f: LeaveNotifyFacts): { subject: string; heading: string; lead: string; button: string } {
  const who = esc(f.actorName), req = esc(f.requesterName);
  switch (m) {
    case "needsSM": return { subject: `Leave to approve: ${f.requesterName}`, heading: "Leave request to approve", lead: `<strong>${req}</strong> has asked for ${esc(f.typeName)}.`, button: "Review request" };
    case "needsHod": return { subject: `Leave for your approval: ${f.requesterName}`, heading: "Leave request for your approval", lead: `<strong>${req}</strong> is waiting for the HOD's approval for ${esc(f.typeName)}.`, button: "Review request" };
    case "approved": return { subject: "Your leave is approved", heading: "Your leave is approved", lead: `Your ${esc(f.typeName)} has been approved.`, button: "Open Leave" };
    case "rejected": return { subject: "Your leave was not approved", heading: "Your leave was not approved", lead: `<strong>${who}</strong> did not approve your ${esc(f.typeName)}.`, button: "Open Leave" };
    case "cancelledByOther": return { subject: "Your leave was cancelled", heading: "Your leave was cancelled", lead: `<strong>${who}</strong> cancelled your ${esc(f.typeName)}.`, button: "Open Leave" };
    case "cancelledApproved": return { subject: `Approved leave cancelled: ${f.requesterName}`, heading: "Approved leave cancelled", lead: `<strong>${req}</strong> has cancelled approved ${esc(f.typeName)}.`, button: "Open Leave" };
    case "covering": return { subject: `You are covering for ${f.requesterName}`, heading: "You are covering for a colleague", lead: `<strong>${req}</strong> named you to cover while they are on ${esc(f.typeName)}.`, button: "Open Leave" };
  }
}

/** Fire-and-forget: a mail problem must never undo or fail the leave step. */
export function notifyLeaveStep(f: LeaveNotifyFacts): void {
  (async () => {
    for (const r of await leaveRecipients(f)) {
      const m = message(r.msg, f);
      const link = r.msg === "needsSM" || r.msg === "needsHod" ? "/leave?tab=approvals" : "/leave";
      createNotification({ staffId: r.staffId, title: m.heading, body: `${f.requesterName}, ${range(f)}`, category: "Leave", linkUrl: link })
        .catch((e) => console.error("[leave-notify] in-app failed", e));
      const email = await getStaffEmail(r.staffId);
      if (!email) continue;
      const rows =
        field("Person", esc(f.requesterName)) + field("Leave", esc(f.typeName)) + field("Dates", range(f)) + field("Working days", String(f.days)) +
        (f.reason ? field("Reason", esc(f.reason)) : "") + (f.note && (r.msg === "rejected" || r.msg === "cancelledByOther") ? field("Note", esc(f.note)) : "");
      await send(email, m.subject, wrap(m.heading, `
        <p style="color:#374151;font-size:14px;margin:0 0 12px;">${m.lead}</p>
        <table style="border-collapse:collapse;margin:12px 0;">${rows}</table>
        <a href="${APP_URL}${link}" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin:8px 0;">${m.button}</a>
      `));
    }
  })().catch((e) => console.error("[leave-notify] failed", e));
}
