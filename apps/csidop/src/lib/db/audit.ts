import { createHash } from "crypto";
import pool from "@/lib/db/pool";
import type { PoolClient } from "pg";

const GENESIS_HASH = createHash("sha256").update("GENESIS").digest("hex");

interface AuditEntry {
  entityName: string;
  entityId: string;
  action: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  performedBy: string;
}

export async function insertAuditEntry(
  entry: AuditEntry,
  client?: PoolClient
): Promise<void> {
  const conn = client ?? (await pool.connect());
  try {
    const prevResult = await conn.query<{ ChecksumHash: string }>(
      `SELECT checksumhash AS "ChecksumHash" FROM audit_log ORDER BY id DESC LIMIT 1`
    );
    const prevHash =
      prevResult.rows.length > 0
        ? prevResult.rows[0].ChecksumHash
        : GENESIS_HASH;

    const now = new Date().toISOString();
    const content = [
      prevHash,
      entry.entityName,
      entry.entityId,
      entry.action,
      entry.fieldName ?? "",
      entry.oldValue ?? "",
      entry.newValue ?? "",
      entry.reason ?? "",
      entry.performedBy,
      now,
    ].join("|");

    const checksumHash = createHash("sha256").update(content).digest("hex");

    await conn.query(
      `INSERT INTO audit_log
        (entityname, entityid, action, fieldname, oldvalue, newvalue,
         reason, performedby, performedat, checksumhash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.entityName,
        entry.entityId,
        entry.action,
        entry.fieldName ?? null,
        entry.oldValue ?? null,
        entry.newValue ?? null,
        entry.reason ?? null,
        entry.performedBy,
        now,
        checksumHash,
      ]
    );
  } finally {
    if (!client) conn.release();
  }
}
