import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  createSessionFromStaff,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { isDevMode, getDevStaffRow } from "@/lib/auth/dev-session";
import { badRequest } from "@/lib/response";

export async function GET(request: NextRequest) {
  const redirectTo =
    request.nextUrl.searchParams.get("redirect_to") || "/";

  // ── Dev bypass ────────────────────────────────────────────────────────────
  if (isDevMode()) {
    const staffRow = await getDevStaffRow();
    const { cookieValue } = await createSessionFromStaff(staffRow);
    const res = NextResponse.redirect(
      new URL(redirectTo, request.nextUrl.origin)
    );
    res.cookies.set(SESSION_COOKIE_NAME, cookieValue, sessionCookieOptions());
    return res;
  }

  // ── OIDC login ────────────────────────────────────────────────────────────
  const providerUrl = process.env.OIDC_PROVIDER_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  const redirectUri = process.env.OIDC_REDIRECT_URI;

  if (!providerUrl || !clientId || !redirectUri) {
    return badRequest("OIDC is not configured");
  }

  // Generate PKCE code_verifier (48 random bytes → base64url)
  const verifierBytes = new Uint8Array(48);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64url(verifierBytes);

  // code_challenge = BASE64URL(SHA-256(code_verifier))
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = base64url(new Uint8Array(digest));

  // State: random value for CSRF protection
  const state = crypto.randomUUID();

  // Store verifier + state + redirect in a short-lived cookie
  const oidcState = JSON.stringify({
    state,
    codeVerifier,
    redirectTo,
  });

  const authorizeUrl = new URL(`${providerUrl}/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authorizeUrl.toString());
  res.cookies.set("csidop_oidc_state", oidcState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300, // 5 minutes
  });

  return res;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
