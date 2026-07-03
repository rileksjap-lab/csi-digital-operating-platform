import pool, { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";
import type { AuthSession } from "@/lib/types/api";
import {
  type CursorPage,
  encodeCursor,
  decodeCursor,
} from "@/lib/db/repo-utils";
import { insertAuditEntry } from "@/lib/db/audit";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EffortListItem {
  id: string;
  woId: string;
  csiWoNo: string;
  staffId: string;
  staffName: string;
  logDate: string;
  hours: number;
  notes: string | null;
  createdAt: string;
}

export interface EffortListFilters {
  woId?: string;
  staffId?: string;
  logDateFrom?: string;
  logDateTo?: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  limit: number;
  after?: string;
}

// ─── List ───────────────────────────────────────────────────────────────────

const SORT_MAP: Record<string, string> = {
  logDate: "e.logdate",
  createdAt: "e.createdat",
};

export async function listEffortEntries(
  filters: EffortListFilters,
  scope: ScopeFilter
): Promise<CursorPage<EffortListItem>> {
  const params: unknown[] = [];
  const wheres: string[] = [];
  let pi = 1;

  // Scope: effort belongs to a WO, so scope through the parent WO
  if (scope.scope === "Self") {
    wheres.push(`AND e.staffid = $${pi}`);
    params.push(scope.staffId);
    pi++;
  } else if (scope.scope === "Pod") {
    wheres.push(`AND (e.staffid IN (
      SELECT s.id FROM staff s WHERE s.deptid = $${pi} AND s.subteam = $${pi + 1}
    ) OR e.staffid = $${pi + 2})`);
    params.push(scope.departmentId, scope.subTeam, scope.staffId);
    pi += 3;
  }

  if (filters.woId) {
    wheres.push(`AND e.csi_wo_id = $${pi}`);
    params.push(filters.woId);
    pi++;
  }
  if (filters.staffId) {
    wheres.push(`AND e.staffid = $${pi}`);
    params.push(filters.staffId);
    pi++;
  }
  if (filters.logDateFrom) {
    wheres.push(`AND e.logdate >= $${pi}`);
    params.push(filters.logDateFrom);
    pi++;
  }
  if (filters.logDateTo) {
    wheres.push(`AND e.logdate <= $${pi}`);
    params.push(filters.logDateTo);
    pi++;
  }

  // Cursor
  const sortCol = SORT_MAP[filters.sortBy] ?? "e.logdate";
  const cursor = filters.after ? decodeCursor(filters.after) : null;
  if (cursor) {
    const op = filters.sortDir === "asc" ? ">" : "<";
    wheres.push(`AND (${sortCol}, e.id) ${op} ($${pi}, $${pi + 1})`);
    params.push(cursor.sv, cursor.id);
    pi += 2;
  }

  const whereStr = wheres.join("\n    ");
  const dir = filters.sortDir;
  const limitPlus1 = filters.limit + 1;

  const dataSQL = `
    SELECT e.id AS "Id", e.csi_wo_id AS "WoId", w.csi_wo_no AS "CsiWoNo",
           e.staffid AS "StaffId", s.name AS "StaffName",
           e.logdate AS "LogDate", e.hours AS "Hours", e.notes AS "Notes",
           e.createdat AS "CreatedAt"
    FROM effort_log e
    JOIN csi_wo w ON w.id = e.csi_wo_id
    JOIN staff s ON s.id = e.staffid
    WHERE 1=1
    ${whereStr}
    ORDER BY ${sortCol} ${dir}, e.id ${dir}
    LIMIT $${pi}`;
  params.push(limitPlus1);

  const countSQL = `
    SELECT COUNT(*) AS "total"
    FROM effort_log e
    JOIN csi_wo w ON w.id = e.csi_wo_id
    WHERE 1=1
    ${whereStr}`;
  const countParams = params.slice(0, params.length - 1 - (cursor ? 2 : 0));

  const [dataRes, countRes] = await Promise.all([
    query(dataSQL, params),
    query<{ total: string }>(countSQL, countParams),
  ]);

  const total = parseInt(countRes.rows[0]?.total ?? "0", 10);
  const hasNextPage = dataRes.rows.length > filters.limit;
  const rows = dataRes.rows.slice(0, filters.limit);
  const lastRow = rows[rows.length - 1];
  const nextCursor =
    hasNextPage && lastRow
      ? encodeCursor(
          lastRow.Id as string,
          String(lastRow[filters.sortBy === "logDate" ? "LogDate" : "CreatedAt"])
        )
      : null;

  return {
    rows: rows.map(mapEffortItem),
    total,
    hasNextPage,
    nextCursor,
  };
}

function mapEffortItem(r: Record<string, unknown>): EffortListItem {
  return {
    id: r.Id as string,
    woId: r.WoId as string,
    csiWoNo: r.CsiWoNo as string,
    staffId: r.StaffId as string,
    staffName: r.StaffName as string,
    logDate: String(r.LogDate),
    hours: parseFloat(String(r.Hours)),
    notes: (r.Notes as string) ?? null,
    createdAt: String(r.CreatedAt),
  };
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createEffortEntry(
  input: { woId: string; staffId?: string; logDate: string; hours: number; notes?: string },
  session: AuthSession,
  scope: ScopeFilter
): Promise<{ result: EffortListItem | null; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify WO exists and is active (not Closed)
    const woRes = await client.query(
      `SELECT w.id, w.status, w.assignedto, w.csi_wo_no AS "csiWoNo"
       FROM csi_wo w
       WHERE w.id = $1`,
      [input.woId]
    );
    if (woRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: null, error: "NOT_FOUND" };
    }
    const wo = woRes.rows[0];

    const LEAD_ROLES = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];
    const isLead = LEAD_ROLES.includes(session.role);
    if (!isLead && wo.assignedto !== session.staffId) {
      await client.query("ROLLBACK");
      return { result: null, error: "NOT_ASSIGNEE" };
    }

    // logDate must not be in the future
    const today = new Date().toISOString().slice(0, 10);
    if (input.logDate > today) {
      await client.query("ROLLBACK");
      return { result: null, error: "FUTURE_DATE" };
    }

    // Target staff: either the specified colleague or the caller themselves
    const targetStaffId = input.staffId ?? session.staffId;

    // If logging on behalf, verify the target staff exists and is active
    let targetStaffName = session.displayName;
    if (input.staffId && input.staffId !== session.staffId) {
      const staffRes = await client.query<{ Name: string; Status: string }>(
        `SELECT name AS "Name", status AS "Status" FROM staff WHERE id = $1`,
        [input.staffId]
      );
      if (staffRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return { result: null, error: "STAFF_NOT_FOUND" };
      }
      if (staffRes.rows[0].Status !== "Active") {
        await client.query("ROLLBACK");
        return { result: null, error: "STAFF_INACTIVE" };
      }
      targetStaffName = staffRes.rows[0].Name;
    }

    // Insert effort entry under the target staff
    const result = await client.query<{ Id: string; CreatedAt: string }>(
      `INSERT INTO effort_log (csi_wo_id, staffid, logdate, hours, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id AS "Id", createdat AS "CreatedAt"`,
      [input.woId, targetStaffId, input.logDate, input.hours, input.notes ?? null]
    );
    const row = result.rows[0];

    await insertAuditEntry(
      {
        entityName: "EFFORT_LOG",
        entityId: row.Id,
        action: "Insert",
        newValue: JSON.stringify({
          woId: input.woId,
          staffId: targetStaffId,
          logDate: input.logDate,
          hours: input.hours,
          ...(targetStaffId !== session.staffId ? { loggedBy: session.staffId } : {}),
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
        csiWoNo: wo.csiWoNo as string,
        staffId: targetStaffId,
        staffName: targetStaffName,
        logDate: input.logDate,
        hours: input.hours,
        notes: input.notes ?? null,
        createdAt: String(row.CreatedAt),
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Patch (same-day edits only, WO not Closed) ────────────────────────────

export async function patchEffortEntry(
  entryId: string,
  input: { hours?: number; notes?: string },
  session: AuthSession
): Promise<{ result: EffortListItem | null; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch existing entry
    const entryRes = await client.query(
      `SELECT e.id AS "Id", e.csi_wo_id AS "WoId", e.staffid AS "StaffId",
              e.logdate AS "LogDate", e.hours AS "Hours", e.notes AS "Notes",
              e.createdat AS "CreatedAt",
              w.csi_wo_no AS "CsiWoNo", w.status AS "WoStatus"
       FROM effort_log e
       JOIN csi_wo w ON w.id = e.csi_wo_id
       WHERE e.id = $1`,
      [entryId]
    );
    if (entryRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: null, error: "NOT_FOUND" };
    }
    const entry = entryRes.rows[0];

    const isLeadRole = ["HOD", "SolutionManager"].includes(session.role);

    // Must be the staff who created the entry (unless HOD/SM)
    if (!isLeadRole && entry.StaffId !== session.staffId) {
      await client.query("ROLLBACK");
      return { result: null, error: "NOT_OWN_ENTRY" };
    }

    const logDateStr = String(entry.LogDate).slice(0, 10);

    // Same-day edits only (unless HOD/SM)
    if (!isLeadRole) {
      const today = new Date().toISOString().slice(0, 10);
      if (logDateStr !== today) {
        await client.query("ROLLBACK");
        return { result: null, error: "NOT_SAME_DAY" };
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (input.hours !== undefined) {
      sets.push(`hours = $${pi}`);
      params.push(input.hours);
      pi++;
    }
    if (input.notes !== undefined) {
      sets.push(`notes = $${pi}`);
      params.push(input.notes);
      pi++;
    }

    if (sets.length === 0) {
      await client.query("ROLLBACK");
      return { result: mapEffortRow(entry) };
    }

    sets.push(`updatedat = now()`);
    params.push(entryId);
    // Partitioned table: need logdate in WHERE for partition pruning
    params.push(entry.LogDate);
    await client.query(
      `UPDATE effort_log SET ${sets.join(", ")} WHERE id = $${pi} AND logdate = $${pi + 1}`,
      params
    );

    await insertAuditEntry(
      {
        entityName: "EFFORT_LOG",
        entityId: entryId,
        action: "Update",
        oldValue: JSON.stringify({ hours: parseFloat(String(entry.Hours)), notes: entry.Notes }),
        newValue: JSON.stringify({ hours: input.hours ?? parseFloat(String(entry.Hours)), notes: input.notes ?? entry.Notes }),
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    // Get staff name for response
    const staffRes = await query(`SELECT name AS "Name" FROM staff WHERE id = $1`, [session.staffId]);

    return {
      result: {
        id: entry.Id as string,
        woId: entry.WoId as string,
        csiWoNo: entry.CsiWoNo as string,
        staffId: session.staffId,
        staffName: (staffRes.rows[0]?.Name as string) ?? session.displayName,
        logDate: logDateStr,
        hours: input.hours ?? parseFloat(String(entry.Hours)),
        notes: input.notes !== undefined ? input.notes : (entry.Notes as string) ?? null,
        createdAt: String(entry.CreatedAt),
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Delete (same rules as patch: own-entry+same-day, HOD/SM any entry) ────

export async function deleteEffortEntry(
  entryId: string,
  session: AuthSession
): Promise<{ error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const entryRes = await client.query(
      `SELECT e.id AS "Id", e.staffid AS "StaffId", e.logdate AS "LogDate",
              e.hours AS "Hours", e.notes AS "Notes"
       FROM effort_log e
       WHERE e.id = $1`,
      [entryId]
    );
    if (entryRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { error: "NOT_FOUND" };
    }
    const entry = entryRes.rows[0];

    const isLeadRole = ["HOD", "SolutionManager"].includes(session.role);

    // Must be the staff who created the entry (unless HOD/SM)
    if (!isLeadRole && entry.StaffId !== session.staffId) {
      await client.query("ROLLBACK");
      return { error: "NOT_OWN_ENTRY" };
    }

    // Same-day deletes only (unless HOD/SM)
    if (!isLeadRole) {
      const today = new Date().toISOString().slice(0, 10);
      const logDateStr = String(entry.LogDate).slice(0, 10);
      if (logDateStr !== today) {
        await client.query("ROLLBACK");
        return { error: "NOT_SAME_DAY" };
      }
    }

    // Partitioned table: need logdate in WHERE for partition pruning
    await client.query(
      `DELETE FROM effort_log WHERE id = $1 AND logdate = $2`,
      [entryId, entry.LogDate]
    );

    await insertAuditEntry(
      {
        entityName: "EFFORT_LOG",
        entityId: entryId,
        action: "Delete",
        oldValue: JSON.stringify({ hours: parseFloat(String(entry.Hours)), notes: entry.Notes }),
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");
    return {};
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function mapEffortRow(r: Record<string, unknown>): EffortListItem {
  return {
    id: r.Id as string,
    woId: r.WoId as string,
    csiWoNo: r.CsiWoNo as string,
    staffId: r.StaffId as string,
    staffName: "",
    logDate: String(r.LogDate).slice(0, 10),
    hours: parseFloat(String(r.Hours)),
    notes: (r.Notes as string) ?? null,
    createdAt: String(r.CreatedAt),
  };
}
