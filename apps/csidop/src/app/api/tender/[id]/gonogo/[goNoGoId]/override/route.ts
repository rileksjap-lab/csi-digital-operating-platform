import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, notFound, badRequest, zodError, internalError } from "@/lib/response";
import { overrideGoNoGo } from "@/lib/repositories/gonogo.repo";
import { gonogoOverrideSchema } from "@/lib/validations/capacity.schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; goNoGoId: string }> }
) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD");

    const { id, goNoGoId } = await params;
    const body = await request.json();
    const parsed = gonogoOverrideSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { result, error } = await overrideGoNoGo(
      id,
      goNoGoId,
      parsed.data.overrideReason,
      session
    );

    if (error === "NOT_FOUND") return notFound("Go/No-Go evaluation not found");
    if (error === "ALREADY_GO") return badRequest("Evaluation is already a Go recommendation");
    if (error === "ALREADY_OVERRIDDEN") return badRequest("This evaluation has already been overridden");
    if (!result) return notFound("Go/No-Go evaluation not found");

    return ok(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[tender/:id/gonogo/:goNoGoId/override] POST error", err);
    return internalError(reqId);
  }
}
