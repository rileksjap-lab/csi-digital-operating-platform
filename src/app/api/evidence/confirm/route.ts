import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { created, badRequest, forbidden, zodError, internalError } from "@/lib/response";
import { confirmUpload } from "@/lib/repositories/evidence.repo";
import { evidenceConfirmSchema } from "@/lib/validations/wo.schema";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "TeamMember", "TeamLead", "BIMModeler");

    const body = await request.json();
    const parsed = evidenceConfirmSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { result, error } = await confirmUpload(
      parsed.data.uploadIntentId,
      parsed.data.evidenceType,
      session
    );

    if (error === "UPLOAD_INTENT_EXPIRED") {
      return badRequest("Upload intent expired or already confirmed");
    }
    if (error === "FORBIDDEN") return forbidden("You did not create this upload intent");
    if (!result) return badRequest("Upload confirmation failed");

    return created(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[evidence/confirm] POST error", err);
    return internalError(reqId);
  }
}
