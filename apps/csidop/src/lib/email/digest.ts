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

interface DigestStats {
  woOpen: number;
  woInProgress: number;
  woPendingApproval: number;
  woClosedPeriod: number;
  woNewPeriod: number;
  woOverdue: number;
  totalEffortHours: number;
  unassignedWos: number;
  overdueWos: { csiWoNo: string; title: string; dueDate: string }[];
  pendingApprovals: { csiWoNo: string; title: string; submittedBy: string }[];
  topUtilization: { name: string; utilization: number; band: string }[];
}

async function getDigestStats(period: "daily" | "weekly"): Promise<DigestStats> {
  const interval = period === "daily" ? "1 day" : "7 days";

  const [statusCounts, closedPeriod, newPeriod, overdue, effort, unassigned, overdueList, pendingList, utilList] =
    await Promise.all([
      query<{ status: string; count: string }>(
        `SELECT status, count(*)::int AS count FROM csi_wo
         WHERE status NOT IN ('Closed', 'Cancelled')
         GROUP BY status`
      ),
      query<{ count: string }>(
        `SELECT count(*)::int AS count FROM csi_wo
         WHERE status = 'Closed' AND updatedat >= now() - $1::interval`,
        [interval]
      ),
      query<{ count: string }>(
        `SELECT count(*)::int AS count FROM csi_wo
         WHERE duedate >= now() - $1::interval`,
        [interval]
      ),
      query<{ count: string }>(
        `SELECT count(*)::int AS count FROM csi_wo
         WHERE duedate < CURRENT_DATE AND status NOT IN ('Closed', 'Cancelled')`
      ),
      query<{ hours: string }>(
        `SELECT COALESCE(sum(hours), 0)::numeric AS hours FROM effort_log
         WHERE logdate >= now() - $1::interval`,
        [interval]
      ),
      query<{ count: string }>(
        `SELECT count(*)::int AS count FROM csi_wo
         WHERE assignedto IS NULL AND status NOT IN ('Closed', 'Cancelled')`
      ),
      query<{ csiWoNo: string; title: string; dueDate: string }>(
        `SELECT csi_wo_no AS "csiWoNo", title,
                to_char(duedate, 'DD Mon YYYY') AS "dueDate"
         FROM csi_wo
         WHERE duedate < CURRENT_DATE AND status NOT IN ('Closed', 'Cancelled')
         ORDER BY duedate ASC LIMIT 5`
      ),
      query<{ csiWoNo: string; title: string; submittedBy: string }>(
        `SELECT w.csi_wo_no AS "csiWoNo", w.title,
                COALESCE(s.name, 'Unknown') AS "submittedBy"
         FROM csi_wo w
         LEFT JOIN staff s ON s.id = w.assignedto
         WHERE w.status = 'PendingApproval'
         ORDER BY w.updatedat DESC LIMIT 5`
      ),
      query<{ name: string; utilization: number; band: string }>(
        `SELECT s.name,
                LEAST(round(
                  (COALESCE(ah.assigned, 0) / 160.0) * 100
                ), 100)::int AS utilization,
                CASE
                  WHEN (COALESCE(ah.assigned, 0) / 160.0) * 100 >= 90 THEN 'Overloaded'
                  WHEN (COALESCE(ah.assigned, 0) / 160.0) * 100 >= 75 THEN 'Warning'
                  ELSE 'OK' END AS band
         FROM staff s
         JOIN department d ON d.id = s.deptid
         LEFT JOIN (
           SELECT a.staffid, sum(a.assignedhours) AS assigned
           FROM assignment a
           JOIN csi_wo w ON w.id = a.csi_wo_id
           WHERE a.iscurrent = true AND w.status NOT IN ('Closed', 'Cancelled')
           GROUP BY a.staffid
         ) ah ON ah.staffid = s.id
         WHERE d.deptcode = 'CSI' AND s.status = 'Active'
         ORDER BY utilization DESC LIMIT 8`
      ),
    ]);

  const statusMap: Record<string, number> = {};
  for (const r of statusCounts.rows) statusMap[r.status] = Number(r.count);

  return {
    woOpen: statusMap["Open"] ?? 0,
    woInProgress: statusMap["InProgress"] ?? 0,
    woPendingApproval: statusMap["PendingApproval"] ?? 0,
    woClosedPeriod: Number(closedPeriod.rows[0]?.count ?? 0),
    woNewPeriod: Number(newPeriod.rows[0]?.count ?? 0),
    woOverdue: Number(overdue.rows[0]?.count ?? 0),
    totalEffortHours: Number(effort.rows[0]?.hours ?? 0),
    unassignedWos: Number(unassigned.rows[0]?.count ?? 0),
    overdueWos: overdueList.rows,
    pendingApprovals: pendingList.rows,
    topUtilization: utilList.rows,
  };
}

export async function sendDigestEmail(
  staffId: string,
  name: string,
  email: string,
  period: "daily" | "weekly"
): Promise<void> {
  if (!smtpUser || !smtpPass) return;

  const stats = await getDigestStats(period);
  const periodLabel = period === "daily" ? "Daily" : "Weekly";

  const alertItems: string[] = [];
  if (stats.woOverdue > 0)
    alertItems.push(`<span style="color:#dc2626;">&#x26A0; ${stats.woOverdue} overdue WO(s)</span>`);
  if (stats.unassignedWos > 0)
    alertItems.push(`<span style="color:#d97706;">&#x26A0; ${stats.unassignedWos} unassigned WO(s)</span>`);
  if (stats.woPendingApproval > 0)
    alertItems.push(`<span style="color:#7c3aed;">${stats.woPendingApproval} pending approval(s)</span>`);
  const overloadedStaff = stats.topUtilization.filter((s) => s.band === "Overloaded");
  if (overloadedStaff.length > 0)
    alertItems.push(
      `<span style="color:#dc2626;">${overloadedStaff.length} staff overloaded (${overloadedStaff.map((s) => s.name.split(" ")[0]).join(", ")})</span>`
    );

  const alertSection =
    alertItems.length > 0
      ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin:0 0 16px;">
           <p style="font-weight:600;color:#991b1b;font-size:13px;margin:0 0 6px;">Action Required</p>
           ${alertItems.map((a) => `<p style="font-size:13px;margin:2px 0;">${a}</p>`).join("")}
         </div>`
      : "";

  const kpiRow = (label: string, value: string | number) =>
    `<tr><td style="color:#6b7280;font-size:13px;padding:4px 12px 4px 0;">${label}</td><td style="color:#1e293b;font-size:13px;font-weight:600;">${value}</td></tr>`;

  const kpiTable = `
    <table style="border-collapse:collapse;margin:0 0 16px;">
      ${kpiRow("New WOs", stats.woNewPeriod)}
      ${kpiRow("Closed WOs", stats.woClosedPeriod)}
      ${kpiRow("Open", stats.woOpen)}
      ${kpiRow("In Progress", stats.woInProgress)}
      ${kpiRow("Effort Hours", `${stats.totalEffortHours}h`)}
    </table>`;

  let overdueSection = "";
  if (stats.overdueWos.length > 0) {
    const rows = stats.overdueWos
      .map(
        (w) =>
          `<tr><td style="font-size:12px;padding:3px 8px 3px 0;font-family:monospace;color:#6366f1;">${w.csiWoNo}</td><td style="font-size:12px;padding:3px 8px;">${w.title.slice(0, 50)}</td><td style="font-size:12px;padding:3px 0;color:#dc2626;">${w.dueDate}</td></tr>`
      )
      .join("");
    overdueSection = `
      <p style="font-weight:600;font-size:13px;color:#1e293b;margin:16px 0 6px;">Overdue Work Orders</p>
      <table style="border-collapse:collapse;width:100%;">${rows}</table>`;
  }

  let pendingSection = "";
  if (stats.pendingApprovals.length > 0) {
    const rows = stats.pendingApprovals
      .map(
        (w) =>
          `<tr><td style="font-size:12px;padding:3px 8px 3px 0;font-family:monospace;color:#6366f1;">${w.csiWoNo}</td><td style="font-size:12px;padding:3px 8px;">${w.title.slice(0, 50)}</td><td style="font-size:12px;padding:3px 0;color:#6b7280;">${w.submittedBy}</td></tr>`
      )
      .join("");
    pendingSection = `
      <p style="font-weight:600;font-size:13px;color:#1e293b;margin:16px 0 6px;">Pending Approvals</p>
      <table style="border-collapse:collapse;width:100%;">${rows}</table>`;
  }

  let utilSection = "";
  if (stats.topUtilization.length > 0) {
    const rows = stats.topUtilization
      .map((s) => {
        const color =
          s.band === "Overloaded" ? "#dc2626" : s.band === "Warning" ? "#d97706" : "#16a34a";
        return `<tr><td style="font-size:12px;padding:3px 8px 3px 0;">${s.name}</td><td style="font-size:12px;padding:3px 0;font-weight:600;color:${color};">${s.utilization}%</td></tr>`;
      })
      .join("");
    utilSection = `
      <p style="font-weight:600;font-size:13px;color:#1e293b;margin:16px 0 6px;">Team Utilization</p>
      <table style="border-collapse:collapse;width:100%;">${rows}</table>`;
  }

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#1A1A2E;padding:16px 24px;border-radius:8px 8px 0 0;">
        <span style="color:#fff;font-size:14px;font-weight:600;">CSI Digital Operating Platform</span>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <h2 style="color:#1e293b;font-size:16px;margin:0 0 4px;">${periodLabel} Digest</h2>
        <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">
          Hi ${name.split(" ")[0]}, here's your ${period} summary for ${new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}
        </p>
        ${alertSection}
        ${kpiTable}
        ${overdueSection}
        ${pendingSection}
        ${utilSection}
        <div style="margin:20px 0 0;">
          <a href="${APP_URL}" style="display:inline-block;background:#6366f1;color:#fff;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">Open Dashboard</a>
        </div>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" />
        <p style="color:#9ca3af;font-size:11px;margin:0;">
          <a href="${APP_URL}" style="color:#6366f1;text-decoration:none;">Open CSIDOP</a> &middot;
          10 Creative Solutions Sdn Bhd
        </p>
      </div>
    </div>`;

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `[CSIDOP] ${periodLabel} Digest — ${new Date().toLocaleDateString("en-MY", { day: "numeric", month: "short" })}`,
    html,
  });
}
