import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { destroySession, SESSION_COOKIE_NAME } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (cookie) {
    await destroySession(cookie.value);
  }

  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
