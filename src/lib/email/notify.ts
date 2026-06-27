import nodemailer from "nodemailer";
import { query } from "@/lib/db/pool";

const smtpUser = process.env.SMTP_USER ?? process.env.IMAP_USER;
const smtpPass = process.env.SMTP_PASS ?? process.env.IMAP_PASS;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.office365.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: smtpUser, pass: smtpPass },
});

const FROM = process.env.SMTP_FROM ?? `CSI DOP <${smtpUser ?? "noreply@csidop.local"}>`;
const APP_URL = process.env.APP_URL ?? "https://csidop.10creativesolutions.com";

function isConfigured(): boolean {
  return !!(smtpUser && smtpPass);
}

function wrap(title: string, body: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 0;">
      <div style="background: #1A1A2E; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <span style="color: #fff; font-size: 14px; font-weight: 600;">CSI Digital Operating Platform</span>
      </div>
      <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <h2 style="color: #1e293b; font-size: 16px; margin: 0 0 16px 0;">${title}</h2>
        ${body}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0 16px;" />
        <p style="color: #9ca3af; font-size: 11px; margin: 0;">
          <a href="${APP_URL}" style="color: #6366f1; text-decoration: none;">Open CSIDOP</a> &middot;
          10 Creative Solutions Sdn Bhd
        </p>
      </div>
    </div>`;
}

function field(label: string, value: string): string {
  return `<tr><td style="color:#6b7280;font-size:13px;padding:4px 12px 4px 0;white-space:nowrap;">${label}</td><td style="color:#1e293b;font-size:13px;padding:4px 0;font-weight:500;">${value}</td></tr>`;
}

function woFields(wo: { csiWoNo: string; title: string; priority?: string; dueDate?: string }): string {
  let rows = field("WO No.", wo.csiWoNo) + field("Title", wo.title);
  if (wo.priority) rows += field("Priority", wo.priority);
  if (wo.dueDate) rows += field("Due Date", wo.dueDate);
  return `<table style="border-collapse:collapse;margin:12px 0;">${rows}</table>`;
}

function actionButton(label: string, woId: string): string {
  return `<a href="${APP_URL}/wo/${woId}" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin:8px 0;">${label}</a>`;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  if (!isConfigured()) {
    console.log(`[notify] SMTP not configured — skipped: ${subject} → ${to}`);
    return;
  }
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.error(`[notify] Failed to send "${subject}" to ${to}:`, err);
  }
}

async function getStaffEmail(staffId: string): Promise<string | null> {
  const result = await query<{ email: string }>(
    `SELECT email FROM staff WHERE id = $1 AND status = 'Active'`,
    [staffId]
  );
  return result.rows[0]?.email ?? null;
}

async function getStaffName(staffId: string): Promise<string> {
  const result = await query<{ name: string }>(
    `SELECT name FROM staff WHERE id = $1`,
    [staffId]
  );
  return result.rows[0]?.name ?? "Unknown";
}

// ─── Notification functions (fire-and-forget) ───────────────────────────────

export function notifyWoAssigned(
  assigneeId: string,
  assignedById: string,
  wo: { id: string; csiWoNo: string; title: string; priority?: string; dueDate?: string },
  hours: number
): void {
  (async () => {
    const [email, assignerName] = await Promise.all([
      getStaffEmail(assigneeId),
      getStaffName(assignedById),
    ]);
    if (!email) return;
    await send(
      email,
      `WO Assigned to You: ${wo.csiWoNo}`,
      wrap("Work Order Assigned to You", `
        <p style="color:#374151;font-size:14px;margin:0 0 12px;">
          <strong>${assignerName}</strong> has assigned a work order to you.
        </p>
        ${woFields(wo)}
        ${field("Allocated Hours", `${hours}h`)}
        ${actionButton("View Work Order", wo.id)}
      `)
    );
  })().catch(() => {});
}

export function notifyWoReassigned(
  newAssigneeId: string,
  oldAssigneeId: string | null,
  assignedById: string,
  wo: { id: string; csiWoNo: string; title: string },
  reason?: string
): void {
  (async () => {
    const assignerName = await getStaffName(assignedById);

    const newEmail = await getStaffEmail(newAssigneeId);
    if (newEmail) {
      await send(
        newEmail,
        `WO Reassigned to You: ${wo.csiWoNo}`,
        wrap("Work Order Reassigned to You", `
          <p style="color:#374151;font-size:14px;margin:0 0 12px;">
            <strong>${assignerName}</strong> has reassigned this work order to you.
          </p>
          ${woFields(wo)}
          ${reason ? field("Reason", reason) : ""}
          ${actionButton("View Work Order", wo.id)}
        `)
      );
    }

    if (oldAssigneeId) {
      const oldEmail = await getStaffEmail(oldAssigneeId);
      if (oldEmail) {
        const newName = await getStaffName(newAssigneeId);
        await send(
          oldEmail,
          `WO Reassigned: ${wo.csiWoNo}`,
          wrap("Work Order Reassigned", `
            <p style="color:#374151;font-size:14px;margin:0 0 12px;">
              <strong>${wo.csiWoNo}</strong> has been reassigned from you to <strong>${newName}</strong>.
            </p>
            ${woFields(wo)}
            ${reason ? field("Reason", reason) : ""}
          `)
        );
      }
    }
  })().catch(() => {});
}

export function notifyWoPendingApproval(
  woId: string,
  wo: { csiWoNo: string; title: string; priority?: string },
  submittedById: string,
  approverRole: string
): void {
  (async () => {
    const submitterName = await getStaffName(submittedById);

    // Find approver(s) by role in CSI dept
    const result = await query<{ email: string }>(
      `SELECT s.email FROM staff s
       JOIN role r ON r.id = s.roleid
       JOIN department d ON d.id = s.deptid
       WHERE r.rolecode = $1 AND d.deptcode = 'CSI' AND s.status = 'Active'`,
      [approverRole]
    );

    for (const row of result.rows) {
      await send(
        row.email,
        `WO Pending Your Approval: ${wo.csiWoNo}`,
        wrap("Work Order Pending Approval", `
          <p style="color:#374151;font-size:14px;margin:0 0 12px;">
            <strong>${submitterName}</strong> has submitted a work order for your approval.
          </p>
          ${woFields(wo)}
          ${actionButton("Review & Approve", woId)}
        `)
      );
    }
  })().catch(() => {});
}

export function notifyWoApproved(
  woId: string,
  wo: { csiWoNo: string; title: string },
  approvedById: string,
  assigneeId: string | null,
  createdById: string
): void {
  (async () => {
    const approverName = await getStaffName(approvedById);
    const recipients = new Set<string>();

    if (assigneeId) {
      const email = await getStaffEmail(assigneeId);
      if (email) recipients.add(email);
    }
    const creatorEmail = await getStaffEmail(createdById);
    if (creatorEmail) recipients.add(creatorEmail);

    for (const email of recipients) {
      await send(
        email,
        `WO Approved: ${wo.csiWoNo}`,
        wrap("Work Order Approved", `
          <p style="color:#374151;font-size:14px;margin:0 0 12px;">
            <strong>${approverName}</strong> has approved work order <strong>${wo.csiWoNo}</strong>.
            The WO is now <span style="color:#16a34a;font-weight:600;">Closed</span>.
          </p>
          ${woFields(wo)}
          ${actionButton("View Work Order", woId)}
        `)
      );
    }
  })().catch(() => {});
}

export function notifyWoReturned(
  woId: string,
  wo: { csiWoNo: string; title: string },
  returnedById: string,
  assigneeId: string | null,
  createdById: string,
  reason?: string
): void {
  (async () => {
    const returnerName = await getStaffName(returnedById);
    const recipients = new Set<string>();

    if (assigneeId) {
      const email = await getStaffEmail(assigneeId);
      if (email) recipients.add(email);
    }
    const creatorEmail = await getStaffEmail(createdById);
    if (creatorEmail) recipients.add(creatorEmail);

    for (const email of recipients) {
      await send(
        email,
        `WO Returned for Revision: ${wo.csiWoNo}`,
        wrap("Work Order Returned", `
          <p style="color:#374151;font-size:14px;margin:0 0 12px;">
            <strong>${returnerName}</strong> has returned work order <strong>${wo.csiWoNo}</strong> for revision.
          </p>
          ${woFields(wo)}
          ${reason ? field("Reason", reason) : ""}
          ${actionButton("View & Revise", woId)}
        `)
      );
    }
  })().catch(() => {});
}

export function notifyNewWoFromEmail(
  woId: string,
  csiWoNo: string,
  title: string,
  extWoNo: string,
  ministry: string
): void {
  (async () => {
    // Notify HOD CSI
    const result = await query<{ email: string }>(
      `SELECT s.email FROM staff s
       JOIN role r ON r.id = s.roleid
       JOIN department d ON d.id = s.deptid
       WHERE r.rolecode = 'HOD' AND d.deptcode = 'CSI' AND s.status = 'Active'`
    );

    for (const row of result.rows) {
      await send(
        row.email,
        `New WO from CMT Email: ${csiWoNo}`,
        wrap("New Work Order from Email", `
          <p style="color:#374151;font-size:14px;margin:0 0 12px;">
            A new work order has been automatically imported from a CMT email.
          </p>
          <table style="border-collapse:collapse;margin:12px 0;">
            ${field("CSI WO No.", csiWoNo)}
            ${field("EWM WO No.", extWoNo)}
            ${field("Title", title)}
            ${field("Ministry", ministry)}
          </table>
          ${actionButton("View & Assign", woId)}
        `)
      );
    }
  })().catch(() => {});
}
