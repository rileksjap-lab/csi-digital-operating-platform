import nodemailer from "nodemailer";

const smtpUser = process.env.SMTP_USER ?? process.env.IMAP_USER;
const smtpPass = process.env.SMTP_PASS ?? process.env.IMAP_PASS;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.office365.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

const FROM = process.env.SMTP_FROM ?? `CSI DOP <${smtpUser ?? "noreply@csidop.local"}>`;

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  if (process.env.NODE_ENV === "development" && !process.env.SMTP_USER) {
    console.log(`[DEV OTP] ${email} → ${code}`);
    return;
  }

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: `Your CSI DOP login code: ${code}`,
    text: [
      `Your one-time login code is: ${code}`,
      "",
      "This code expires in 10 minutes.",
      "If you did not request this, please ignore this email.",
      "",
      "— CSI Digital Operating Platform",
    ].join("\n"),
    html: `
      <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1e40af; margin-bottom: 8px;">CSI DOP</h2>
        <p style="color: #374151; font-size: 14px;">Your one-time login code is:</p>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e40af;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 13px;">This code expires in 10 minutes.</p>
        <p style="color: #9ca3af; font-size: 12px;">If you did not request this, please ignore this email.</p>
      </div>
    `,
  });
}

export async function sendRegistrationNotification(
  adminEmail: string,
  staffName: string,
  staffEmail: string
): Promise<void> {
  if (process.env.NODE_ENV === "development" && !process.env.SMTP_USER) {
    console.log(`[DEV NOTIFY] New registration: ${staffName} (${staffEmail}) → admin: ${adminEmail}`);
    return;
  }

  await transporter.sendMail({
    from: FROM,
    to: adminEmail,
    subject: `New registration pending approval: ${staffName}`,
    text: [
      `A new staff member has registered and needs your approval:`,
      "",
      `Name: ${staffName}`,
      `Email: ${staffEmail}`,
      "",
      `Please log in to the Admin panel to approve or reject.`,
      "",
      "— CSI Digital Operating Platform",
    ].join("\n"),
  });
}
