import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { createRequest, listRequests } from "@/lib/repositories/leave.repo";
import { leaveRequestSchema } from "@/lib/validations/leave.schema";
import { respondFail } from "@/lib/kpi/respond";

// scope=mine (my requests, a year), team (approved and pending in my department, a date window) or pending (what I can act on).
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const q = request.nextUrl.searchParams;
    const scope = q.get("scope") ?? "mine";
    if (scope !== "mine" && scope !== "team" && scope !== "pending") return badRequest("Unknown scope");
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const from = q.get("from"), to = q.get("to");
    if ((from && !iso.test(from)) || (to && !iso.test(to))) return badRequest("Use dates like 2026-12-20");
    const year = q.get("year") ? Number(q.get("year")) : undefined;
    return ok(await listRequests(session, { scope, year, from: from ?? undefined, to: to ?? undefined }));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[leave/requests] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const parsed = leaveRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return zodError(parsed.error);
    const result = await createRequest(session, parsed.data);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[leave/requests] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
