import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ok, badRequest, zodError, unauthorized, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";
import { findStaffByEmail } from "@/lib/repositories/staff.repo";
import {
  createSessionFromStaff,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";

const schema = z.object({
  email: z.string().email().max(150),
  code: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { email, code } = parsed.data;

    // Demo account: bypass OTP validation with fixed code
    const demoEmail = process.env.GUEST_ACCOUNT_EMAIL;
    const demoCode = process.env.GUEST_ACCOUNT_CODE ?? "000000";
    if (demoEmail && email.toLowerCase() === demoEmail.toLowerCase()) {
      if (code !== demoCode) {
        return unauthorized("Invalid guest code");
      }
      const staff = await findStaffByEmail(email);
      if (!staff) {
        return unauthorized("Guest account not found or inactive");
      }
      const { cookieValue, session } = await createSessionFromStaff(staff);
      const response = NextResponse.json(
        { success: true, data: session, meta: null },
        { status: 200 }
      );
      response.cookies.set(SESSION_COOKIE_NAME, cookieValue, sessionCookieOptions());
      return response;
    }

    // Find the latest unused, non-expired OTP for this email
    const { rows: otpRows } = await query<{
      id: string;
      code: string;
      attempts: number;
    }>(
      `SELECT id AS "id", code AS "code", attempts AS "attempts"
       FROM otp_token
       WHERE LOWER(email) = LOWER($1)
         AND used = FALSE
         AND expiresat > NOW()
       ORDER BY createdat DESC
       LIMIT 1`,
      [email]
    );

    if (otpRows.length === 0) {
      return unauthorized("No valid OTP found. Please request a new one.");
    }

    const otp = otpRows[0];

    // Check max attempts (3)
    if (otp.attempts >= 3) {
      await query(`UPDATE otp_token SET used = TRUE WHERE id = $1`, [otp.id]);
      return unauthorized("Too many failed attempts. Please request a new code.");
    }

    // Increment attempt count
    await query(
      `UPDATE otp_token SET attempts = attempts + 1 WHERE id = $1`,
      [otp.id]
    );

    // Verify code
    if (otp.code !== code) {
      const remaining = 2 - otp.attempts;
      return unauthorized(
        `Invalid code. ${remaining > 0 ? `${remaining} attempt${remaining > 1 ? "s" : ""} remaining.` : "Please request a new code."}`
      );
    }

    // Mark OTP as used
    await query(`UPDATE otp_token SET used = TRUE WHERE id = $1`, [otp.id]);

    // Look up active staff record
    const staff = await findStaffByEmail(email);
    if (!staff) {
      return unauthorized("Account not found or inactive");
    }

    // Create session
    const { cookieValue, session } = await createSessionFromStaff(staff);

    const response = NextResponse.json(
      { success: true, data: session, meta: null },
      { status: 200 }
    );
    response.cookies.set(SESSION_COOKIE_NAME, cookieValue, sessionCookieOptions());

    return response;
  } catch (err) {
    console.error("[auth/verify-otp] POST error", err);
    return internalError("otp-verify-failed");
  }
}
