import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeJwt } from "jose";
import { query } from "@/lib/db/pool";
import {
  createSessionFromStaff,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import type { StaffWithRoleRow } from "@/lib/auth/session";
import { unauthorized, internalError } from "@/lib/response";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const requestId = request.headers.get("x-request-id") ?? "unknown";

  if (!code || !state) {
    return unauthorized("Missing authorization code or state");
  }

  // ── Validate state cookie ────────────────────────────────────────────────
  const oidcCookie = request.cookies.get("csidop_oidc_state");
  if (!oidcCookie) {
    return unauthorized("OIDC state cookie missing or expired");
  }

  let oidcState: { state: string; codeVerifier: string; redirectTo: string };
  try {
    oidcState = JSON.parse(oidcCookie.value);
  } catch {
    return unauthorized("Invalid OIDC state cookie");
  }

  if (oidcState.state !== state) {
    return unauthorized("State mismatch — possible CSRF");
  }

  // ── Exchange code for tokens ──────────────────────────────────────────────
  const providerUrl = process.env.OIDC_PROVIDER_URL!;
  const clientId = process.env.OIDC_CLIENT_ID!;
  const clientSecret = process.env.OIDC_CLIENT_SECRET!;
  const redirectUri = process.env.OIDC_REDIRECT_URI!;

  let tokenData: { id_token?: string; access_token?: string };
  try {
    const tokenRes = await fetch(`${providerUrl}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: oidcState.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[auth] token exchange failed", await tokenRes.text());
      return internalError(requestId, "Token exchange failed");
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    console.error("[auth] token exchange error", err);
    return internalError(requestId, "Token exchange failed");
  }

  // ── Extract email from id_token ───────────────────────────────────────────
  const idToken = tokenData.id_token;
  if (!idToken) {
    return internalError(requestId, "No id_token in token response");
  }

  const claims = decodeJwt(idToken);
  const email =
    (claims.email as string) ??
    (claims.preferred_username as string) ??
    null;

  if (!email) {
    return internalError(requestId, "No email claim in id_token");
  }

  // ── Look up STAFF by email ────────────────────────────────────────────────
  const staffResult = await query<StaffWithRoleRow>(
    `SELECT s.id AS "Id", s.staffcode AS "StaffCode", s.name AS "Name", s.email AS "Email",
            s.roleid AS "RoleId", r.rolecode AS "RoleCode", r.rolename AS "RoleName", r.capacityscope AS "CapacityScope",
            s.deptid AS "DeptId", d.deptcode AS "DeptCode", s.subteam AS "SubTeam", s.systemconfigflag AS "SystemConfigFlag"
     FROM staff s
     JOIN role r ON r.id = s.roleid
     JOIN department d ON d.id = s.deptid
     WHERE LOWER(s.email) = LOWER($1) AND s.status = 'Active'
     LIMIT 1`,
    [email]
  );

  if (staffResult.rows.length === 0) {
    return NextResponse.redirect(
      new URL("/auth-error?reason=no_account", request.nextUrl.origin)
    );
  }

  // ── Create session ────────────────────────────────────────────────────────
  const { cookieValue } = await createSessionFromStaff(staffResult.rows[0]);

  const redirectTo = oidcState.redirectTo || "/wo";
  const res = NextResponse.redirect(
    new URL(redirectTo, request.nextUrl.origin)
  );
  res.cookies.set(SESSION_COOKIE_NAME, cookieValue, sessionCookieOptions());
  res.cookies.delete("csidop_oidc_state");

  return res;
}
