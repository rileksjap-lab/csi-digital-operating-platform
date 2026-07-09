import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { notFound, internalError } from "@/lib/response";
import { getEvidenceForDownload } from "@/lib/repositories/evidence.repo";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const scope = buildScopeFilter(session);

    const evidence = await getEvidenceForDownload(id, scope);
    if (!evidence) return notFound("Evidence not found");

    const filePath = path.join(process.cwd(), evidence.fileRef);

    try {
      const buffer = await readFile(filePath);
      const filename = path.basename(evidence.fileRef);
      const ext = path.extname(filename).toLowerCase();

      const mimeMap: Record<string, string> = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".zip": "application/zip",
        ".rar": "application/x-rar-compressed",
      };

      const contentType = mimeMap[ext] || "application/octet-stream";

      return new Response(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
          "Content-Length": String(buffer.length),
        },
      });
    } catch {
      return notFound("Evidence file not found on disk");
    }
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[evidence/:id/download] GET error", err);
    return internalError(reqId);
  }
}
