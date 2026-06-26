import { SignJWT, jwtVerify } from "jose";

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function signSessionJwt(sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret());
}

export async function verifySessionJwt(
  token: string
): Promise<{ sid: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.sid !== "string") return null;
    return { sid: payload.sid };
  } catch {
    return null;
  }
}
