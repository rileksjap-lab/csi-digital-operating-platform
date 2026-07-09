import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { created, badRequest, notFound, internalError } from "@/lib/response";
import { saveEvidenceFile } from "@/lib/repositories/evidence.repo";

export const runtime = "nodejs";

export const maxDuration = 60;

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseErr) {
      console.error("[evidence/upload] formData parse error", parseErr);
      return badRequest("Failed to parse upload. File may be too large or request was malformed.");
    }

    const file = formData.get("file") as File | null;
    const woId = formData.get("woId") as string | null;
    const evidenceType = formData.get("evidenceType") as string | null;
    const caption = (formData.get("caption") as string | null)?.trim() || null;

    if (!file || !woId || !evidenceType) {
      return badRequest("file, woId, and evidenceType are required");
    }

    if (file.size > MAX_FILE_SIZE) {
      return badRequest(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`);
    }

    if (file.size === 0) {
      return badRequest("File is empty");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return badRequest("Only screenshot images (JPG, PNG, GIF, WEBP) are allowed");
    }

    const scope = buildScopeFilter(session);
    const { result, error } = await saveEvidenceFile(
      { woId, evidenceType, caption, file },
      session,
      scope
    );

    if (error === "NOT_FOUND") return notFound("Work order not found");
    if (error === "WO_CLOSED") return badRequest("Cannot upload evidence to a closed work order");
    if (!result) return notFound("Work order not found");

    return created(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[evidence/upload] POST error", err);
    return internalError(reqId);
  }
}
