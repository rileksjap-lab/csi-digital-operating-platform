import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const isAuthRoute =
    pathname.startsWith("/api/auth/") || pathname === "/api/health";

  if (pathname.startsWith("/api/") && !isAuthRoute) {
    const sessionCookie = request.cookies.get("csidop_session");
    if (!sessionCookie) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required",
          },
        },
        { status: 401, headers: { "X-Request-Id": requestId } }
      );
    }

    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Server misconfigured" },
        },
        { status: 500, headers: { "X-Request-Id": requestId } }
      );
    }

    try {
      const key = new TextEncoder().encode(secret);
      const { payload } = await jwtVerify(sessionCookie.value, key);
      if (typeof payload.sid === "string") {
        requestHeaders.set("x-session-id", payload.sid);
      } else {
        throw new Error("Missing sid claim");
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNAUTHENTICATED",
            message: "Session expired or invalid",
          },
        },
        { status: 401, headers: { "X-Request-Id": requestId } }
      );
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
