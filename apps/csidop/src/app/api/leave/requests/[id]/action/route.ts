import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { decide } from "@/lib/repositories/leave.repo";
import { leaveActionSchema } from "@/lib/validations/leave.schema";
import { respondFail } from "@/lib/kpi/respond";

// Approve, reject or cancel a leave request. Who may do which is decided in lib/leave/rules.ts.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return badRequest("Invalid request id");
    const parsed = leaveActionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return zodError(parsed.error);
    const result = await decide(id, session, parsed.data.action, parsed.data.note);
    return result.ok ? ok(result.value) : respondFail(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[leave/requests/:id/action] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
