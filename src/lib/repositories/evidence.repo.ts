import pool, { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";
import type { AuthSession } from "@/lib/types/api";
import { insertAuditEntry } from "@/lib/db/audit";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  id: string;
  woId: string;
  fileRef: string;
  downloadUrl: string;
  evidenceType: string;
  caption: string | null;
  uploadedByName: string;
  uploadedDate: string;
  removedAt: string | null;
}

export interface UploadIntent {
  uploadIntentId: string;
  presignedUrl: string;
  fileRef: string;
}

// ─── In-memory upload intent store (replaced by Redis/DB in production) ─────

interface PendingIntent {
  id: string;
  woId: string;
  fileRef: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  staffId: string;
  createdAt: number;
}

const pendingIntents = new Map<string, PendingIntent>();
const INTENT_TTL_MS = 15 * 60 * 1000; // 15 minutes

function cleanExpiredIntents() {
  const now = Date.now();
  for (const [id, intent] of pendingIntents) {
    if (now - intent.createdAt > INTENT_TTL_MS) pendingIntents.delete(id);
  }
}

// ─── List ───────────────────────────────────────────────────────────────────

export async function listEvidence(
  woId: string,
  evidenceType: string | undefined,
  scope: ScopeFilter
): Promise<EvidenceItem[]> {
  const params: unknown[] = [woId];
  let pi = 2;
  const wheres: string[] = [];

  // Scope through the parent WO
  if (scope.scope === "Self") {
    wheres.push(`AND (w.assignedto = $${pi} OR w.createdby = $${pi})`);
    params.push(scope.staffId);
    pi++;
  } else if (scope.scope === "Pod") {
    wheres.push(`AND (w.assignedto IN (
      SELECT s.id FROM staff s WHERE s.deptid = $${pi} AND s.subteam = $${pi + 1}
    ) OR w.createdby = $${pi + 2})`);
    params.push(scope.departmentId, scope.subTeam, scope.staffId);
    pi += 3;
  }

  if (evidenceType) {
    wheres.push(`AND ed.evidencetype = $${pi}`);
    params.push(evidenceType);
    pi++;
  }

  const result = await query(
    `SELECT ed.id AS "Id", ed.csi_wo_id AS "WoId", ed.fileref AS "FileRef",
            ed.evidencetype AS "EvidenceType", ed.caption AS "Caption",
            s.name AS "UploadedByName",
            ed.uploadeddate AS "UploadedDate", ed.removedat AS "RemovedAt"
     FROM evidence_deliverable ed
     JOIN csi_wo w ON w.id = ed.csi_wo_id
     JOIN staff s ON s.id = ed.uploadedby
     WHERE ed.csi_wo_id = $1 AND ed.removedat IS NULL
     ${wheres.join("\n     ")}
     ORDER BY ed.uploadeddate DESC`,
    params
  );

  return result.rows.map((r) => ({
    id: r.Id as string,
    woId: r.WoId as string,
    fileRef: r.FileRef as string,
    downloadUrl: `/api/evidence/${r.Id}/download`,
    evidenceType: r.EvidenceType as string,
    caption: (r.Caption as string) ?? null,
    uploadedByName: r.UploadedByName as string,
    uploadedDate: String(r.UploadedDate),
    removedAt: r.RemovedAt ? String(r.RemovedAt) : null,
  }));
}

// ─── Upload URL (step 1 of two-step upload) ────────────────────────────────

export async function createUploadIntent(
  input: { woId: string; filename: string; mimeType: string; fileSizeBytes: number },
  session: AuthSession,
  scope: ScopeFilter
): Promise<{ result: UploadIntent | null; error?: string }> {
  const params: unknown[] = [input.woId];
  let pi = 2;
  const wheres: string[] = [];

  if (scope.scope === "Self") {
    wheres.push(`AND (w.assignedto = $${pi} OR w.createdby = $${pi})`);
    params.push(scope.staffId);
    pi++;
  } else if (scope.scope === "Pod") {
    wheres.push(`AND (w.assignedto IN (
      SELECT s.id FROM staff s WHERE s.deptid = $${pi} AND s.subteam = $${pi + 1}
    ) OR w.createdby = $${pi + 2})`);
    params.push(scope.departmentId, scope.subTeam, scope.staffId);
    pi += 3;
  }

  const woRes = await query(
    `SELECT w.id, w.status FROM csi_wo w WHERE w.id = $1 ${wheres.join(" ")}`,
    params
  );
  if (woRes.rows.length === 0) return { result: null, error: "NOT_FOUND" };

  cleanExpiredIntents();

  const intentId = randomUUID();
  const fileRef = `evidence/${input.woId}/${intentId}/${input.filename}`;

  pendingIntents.set(intentId, {
    id: intentId,
    woId: input.woId,
    fileRef,
    filename: input.filename,
    mimeType: input.mimeType,
    fileSizeBytes: input.fileSizeBytes,
    staffId: session.staffId,
    createdAt: Date.now(),
  });

  // In production this would be a real S3 presigned PUT URL
  const presignedUrl = `/api/evidence/dev-upload/${intentId}`;

  return {
    result: { uploadIntentId: intentId, presignedUrl, fileRef },
  };
}

// ─── Confirm (step 2 of two-step upload) ────────────────────────────────────

export async function confirmUpload(
  uploadIntentId: string,
  evidenceType: string,
  session: AuthSession
): Promise<{ result: EvidenceItem | null; error?: string }> {
  cleanExpiredIntents();

  const intent = pendingIntents.get(uploadIntentId);
  if (!intent) return { result: null, error: "UPLOAD_INTENT_EXPIRED" };

  if (intent.staffId !== session.staffId) {
    return { result: null, error: "FORBIDDEN" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ Id: string; UploadedDate: string }>(
      `INSERT INTO evidence_deliverable (csi_wo_id, fileref, evidencetype, uploadedby)
       VALUES ($1, $2, $3, $4)
       RETURNING id AS "Id", uploadeddate AS "UploadedDate"`,
      [intent.woId, intent.fileRef, evidenceType, session.staffId]
    );
    const row = result.rows[0];

    await insertAuditEntry(
      {
        entityName: "EVIDENCE_DELIVERABLE",
        entityId: row.Id,
        action: "Insert",
        newValue: JSON.stringify({ fileRef: intent.fileRef, evidenceType, filename: intent.filename }),
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    pendingIntents.delete(uploadIntentId);

    return {
      result: {
        id: row.Id,
        woId: intent.woId,
        fileRef: intent.fileRef,
        downloadUrl: `/api/evidence/${row.Id}/download`,
        evidenceType,
        caption: null,
        uploadedByName: session.displayName,
        uploadedDate: String(row.UploadedDate),
        removedAt: null,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Direct file upload (single-step) ──────────────────────────────────────

export async function saveEvidenceFile(
  input: { woId: string; evidenceType: string; caption: string | null; file: File },
  session: AuthSession,
  scope: ScopeFilter
): Promise<{ result: EvidenceItem | null; error?: string }> {
  const params: unknown[] = [input.woId];
  let pi = 2;
  const wheres: string[] = [];

  if (scope.scope === "Self") {
    wheres.push(`AND (w.assignedto = $${pi} OR w.createdby = $${pi})`);
    params.push(scope.staffId);
    pi++;
  } else if (scope.scope === "Pod") {
    wheres.push(`AND (w.assignedto IN (
      SELECT s.id FROM staff s WHERE s.deptid = $${pi} AND s.subteam = $${pi + 1}
    ) OR w.createdby = $${pi + 2})`);
    params.push(scope.departmentId, scope.subTeam, scope.staffId);
    pi += 3;
  }

  const woRes = await query(
    `SELECT w.id, w.status FROM csi_wo w WHERE w.id = $1 ${wheres.join(" ")}`,
    params
  );
  if (woRes.rows.length === 0) return { result: null, error: "NOT_FOUND" };
  if (woRes.rows[0].status === "Closed") return { result: null, error: "WO_CLOSED" };

  const fileId = randomUUID();
  const safeFilename = input.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileRef = path.join("uploads", "evidence", input.woId, `${fileId}-${safeFilename}`);
  const fullPath = path.join(process.cwd(), fileRef);

  await mkdir(path.dirname(fullPath), { recursive: true });
  const arrayBuffer = await input.file.arrayBuffer();
  await writeFile(fullPath, Buffer.from(arrayBuffer));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query<{ Id: string; UploadedDate: string }>(
      `INSERT INTO evidence_deliverable (csi_wo_id, fileref, evidencetype, caption, uploadedby)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id AS "Id", uploadeddate AS "UploadedDate"`,
      [input.woId, fileRef, input.evidenceType, input.caption || null, session.staffId]
    );
    const row = result.rows[0];

    await insertAuditEntry(
      {
        entityName: "EVIDENCE_DELIVERABLE",
        entityId: row.Id,
        action: "Insert",
        newValue: JSON.stringify({
          fileRef,
          evidenceType: input.evidenceType,
          caption: input.caption,
          filename: input.file.name,
          size: input.file.size,
        }),
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    return {
      result: {
        id: row.Id,
        woId: input.woId,
        fileRef,
        downloadUrl: `/api/evidence/${row.Id}/download`,
        evidenceType: input.evidenceType,
        caption: input.caption ?? null,
        uploadedByName: session.displayName,
        uploadedDate: String(row.UploadedDate),
        removedAt: null,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Get evidence for download ─────────────────────────────────────────────

export async function getEvidenceForDownload(
  evidenceId: string,
  scope: ScopeFilter
): Promise<{ fileRef: string } | null> {
  const params: unknown[] = [evidenceId];
  let pi = 2;
  const wheres: string[] = [];

  if (scope.scope === "Self") {
    wheres.push(`AND (w.assignedto = $${pi} OR w.createdby = $${pi})`);
    params.push(scope.staffId);
    pi++;
  } else if (scope.scope === "Pod") {
    wheres.push(`AND (w.assignedto IN (
      SELECT s.id FROM staff s WHERE s.deptid = $${pi} AND s.subteam = $${pi + 1}
    ) OR w.createdby = $${pi + 2})`);
    params.push(scope.departmentId, scope.subTeam, scope.staffId);
    pi += 3;
  }

  const result = await query(
    `SELECT ed.fileref AS "FileRef"
     FROM evidence_deliverable ed
     JOIN csi_wo w ON w.id = ed.csi_wo_id
     WHERE ed.id = $1 AND ed.removedat IS NULL
     ${wheres.join(" ")}`,
    params
  );

  if (result.rows.length === 0) return null;
  return { fileRef: result.rows[0].FileRef as string };
}

// ─── Soft-delete ────────────────────────────────────────────────────────────

const LEAD_ROLES = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

export async function softDeleteEvidence(
  evidenceId: string,
  session: AuthSession,
  scope: ScopeFilter
): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch evidence + parent WO status
    const evRes = await client.query(
      `SELECT ed.id, ed.uploadedby, ed.removedat, w.status AS "woStatus"
       FROM evidence_deliverable ed
       JOIN csi_wo w ON w.id = ed.csi_wo_id
       WHERE ed.id = $1`,
      [evidenceId]
    );
    if (evRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { success: false, error: "NOT_FOUND" };
    }
    const ev = evRes.rows[0];

    if (ev.removedat) {
      await client.query("ROLLBACK");
      return { success: false, error: "ALREADY_REMOVED" };
    }

    // After PendingApproval, only leads can remove
    const woInApprovalOrClosed = ev.woStatus === "PendingApproval" || ev.woStatus === "Closed";
    const isLead = LEAD_ROLES.includes(session.role);
    const isOwner = ev.uploadedby === session.staffId;

    if (woInApprovalOrClosed && !isLead) {
      await client.query("ROLLBACK");
      return { success: false, error: "APPROVAL_LOCK" };
    }

    if (!isOwner && !isLead) {
      await client.query("ROLLBACK");
      return { success: false, error: "FORBIDDEN" };
    }

    await client.query(
      `UPDATE evidence_deliverable SET removedat = now(), removedby = $1, updatedat = now()
       WHERE id = $2`,
      [session.staffId, evidenceId]
    );

    await insertAuditEntry(
      {
        entityName: "EVIDENCE_DELIVERABLE",
        entityId: evidenceId,
        action: "Delete",
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
