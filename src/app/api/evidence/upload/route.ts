import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { created, badRequest, notFound, internalError } from "@/lib/response";
import { saveEvidenceFile } from "@/lib/repositories/evidence.repo";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-rar-compressed",
]);

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const woId = formData.get("woId") as string | null;
    const evidenceType = formData.get("evidenceType") as string | null;

    if (!file || !woId || !evidenceType) {
      return badRequest("file, woId, and evidenceType are required");
    }

    if (file.size > MAX_FILE_SIZE) {
      return badRequest(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`);
    }

    if (file.size === 0) {
      return badRequest("File is empty");
    }

    if (!ALLOWED_TYPES.has(file.type) && file.type !== "") {
      return badRequest(`File type '${file.type}' is not allowed`);
    }

    const scope = buildScopeFilter(session);
    const { result, error } = await saveEvidenceFile(
      { woId, evidenceType, file },
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
