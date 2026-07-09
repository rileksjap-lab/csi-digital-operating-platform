import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, zodError, internalError } from "@/lib/response";
import { listCertifications, createCertification } from "@/lib/repositories/skills.repo";
import { certificationListQuerySchema, certificationCreateSchema } from "@/lib/validations/skills.schema";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const qs = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = certificationListQuerySchema.safeParse(qs);
    if (!parsed.success) return zodError(parsed.error);

    const rows = await listCertifications(parsed.data, scope);
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills/certifications] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body = await request.json();
    const parsed = certificationCreateSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const row = await createCertification(parsed.data, session);
    return ok(row);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[skills/certifications] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
