import nodemailer from "nodemailer";

const smtpUser = process.env.SMTP_USER ?? process.env.IMAP_USER;
const smtpPass = process.env.SMTP_PASS ?? process.env.IMAP_PASS;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.office365.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: smtpUser, pass: smtpPass },
});

const FROM = process.env.SMTP_FROM ?? `CSI DOP <${smtpUser ?? "noreply@csidop.local"}>`;

export interface HrMail {
  to: string[];
  subject: string;
  text: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Emails the final KPI results to HR. Outside production, and without SMTP
 * settings, the email is not sent and the result says so (`simulated`), so a
 * test run can never mail real people.
 */
export async function sendHrReportEmail(mail: HrMail): Promise<{ simulated: boolean }> {
  if (process.env.NODE_ENV !== "production" && !process.env.SMTP_USER) {
    console.log(`[DEV HR REPORT] would send "${mail.subject}" to ${mail.to.join(", ")} with ${mail.attachments.length} attachment(s)`);
    return { simulated: true };
  }
  await transporter.sendMail({ from: FROM, to: mail.to, subject: mail.subject, text: mail.text, attachments: mail.attachments });
  return { simulated: false };
}
