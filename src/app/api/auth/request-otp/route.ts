import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, badRequest, zodError, internalError, tooManyRequests } from "@/lib/response";
import { query } from "@/lib/db/pool";
import { sendOtpEmail } from "@/lib/email/send";
import crypto from "crypto";

const schema = z.object({
  email: z.string().email().max(150),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { email } = parsed.data;

    // Check staff exists and is active
    const { rows: staffRows } = await query<{ status: string }>(
      `SELECT status AS "status" FROM staff WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (staffRows.length === 0) {
      return badRequest("No account found with this email. Please register first.");
    }

    const status = staffRows[0].status;
    if (status === "PendingApproval") {
      return badRequest("Your account is pending admin approval");
    }
    if (status === "Rejected") {
      return badRequest("Your account registration was rejected. Please contact an administrator");
    }
    if (status === "Inactive" || status === "OnLeave") {
      return badRequest("Your account is currently inactive. Please contact an administrator");
    }

    // Rate-limit: max 3 OTPs in last 5 minutes
    const { rows: recentRows } = await query<{ count: string }>(
      `SELECT COUNT(*)::int AS "count"
       FROM otp_token
       WHERE LOWER(email) = LOWER($1) AND createdat > NOW() - INTERVAL '5 minutes'`,
      [email]
    );
    if (parseInt(recentRows[0].count, 10) >= 3) {
      return tooManyRequests(300);
    }

    // Invalidate any unused OTPs for this email
    await query(
      `UPDATE otp_token SET used = TRUE WHERE LOWER(email) = LOWER($1) AND used = FALSE`,
      [email]
    );

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await query(
      `INSERT INTO otp_token (email, code, expiresat)
       VALUES (LOWER($1), $2, $3)`,
      [email, code, expiresAt.toISOString()]
    );

    // Send the OTP email
    await sendOtpEmail(email, code);

    const isDev = process.env.NODE_ENV === "development" && !process.env.SMTP_USER;
    return ok({
      message: isDev
        ? "OTP generated (dev mode — see below)"
        : "OTP sent to your email",
      ...(isDev ? { devCode: code } : {}),
    });
  } catch (err) {
    console.error("[auth/request-otp] POST error", err);
    return internalError("otp-request-failed");
  }
}
