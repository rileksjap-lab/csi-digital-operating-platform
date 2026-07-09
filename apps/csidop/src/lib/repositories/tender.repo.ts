import pool, { query } from "@/lib/db/pool";
import type { AuthSession } from "@/lib/types/api";
import {
  type CursorPage,
  encodeCursor,
  decodeCursor,
  buildCursorWhere,
  cursorValue,
} from "@/lib/db/repo-utils";
import { insertAuditEntry } from "@/lib/db/audit";

// ─── List types ─────────────────────────────────────────────────────────────

export interface TenderListItem {
  id: string;
  tenderNo: string;
  tenderName: string;
  client: string;
  tenderCategory: string | null;
  closingDate: string;
  estimatedValue: number;
  submittedValue: number | null;
  winValue: number | null;
  status: string;
  ownerName: string;
  createdAt: string;
}

export interface TenderListFilters {
  status?: string;
  category?: string;
  ownerId?: string;
  closingDateFrom?: string;
  closingDateTo?: string;
  q?: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  limit: number;
  after?: string;
}

const SORT_MAP: Record<string, string> = {
  tenderNo: "t.tenderno",
  tenderName: "t.tendername",
  client: "t.client",
  closingDate: "t.closingdate",
  estimatedValue: "t.estimatedvalue",
  status: "t.status",
  createdAt: "t.createdat",
};

export async function listTenders(
  filters: TenderListFilters
): Promise<CursorPage<TenderListItem>> {
  const params: unknown[] = [];
  const wheres: string[] = [];
  let paramIdx = 1;

  // Optional filters
  if (filters.status) {
    const statuses = filters.status.split(",").map((s) => s.trim());
    wheres.push(`AND t.status = ANY($${paramIdx}::varchar[])`);
    params.push(statuses);
    paramIdx++;
  }
  if (filters.category) {
    wheres.push(`AND t.tendercategory = $${paramIdx}`);
    params.push(filters.category);
    paramIdx++;
  }
  if (filters.ownerId) {
    wheres.push(`AND t.tenderownerid = $${paramIdx}`);
    params.push(filters.ownerId);
    paramIdx++;
  }
  if (filters.closingDateFrom) {
    wheres.push(`AND t.closingdate >= $${paramIdx}`);
    params.push(filters.closingDateFrom);
    paramIdx++;
  }
  if (filters.closingDateTo) {
    wheres.push(`AND t.closingdate <= $${paramIdx}`);
    params.push(filters.closingDateTo);
    paramIdx++;
  }
  if (filters.q) {
    wheres.push(
      `AND (t.tendername ILIKE $${paramIdx} OR t.tenderno ILIKE $${paramIdx} OR t.client ILIKE $${paramIdx})`
    );
    params.push(`%${filters.q}%`);
    paramIdx++;
  }

  // Cursor
  const sortCol = SORT_MAP[filters.sortBy] ?? "t.createdat";
  const cursor = filters.after ? decodeCursor(filters.after) : null;
  const cursorWhere = buildCursorWhere(
    cursor,
    sortCol,
    filters.sortDir,
    paramIdx
  );
  if (cursorWhere.clause) {
    // The buildCursorWhere helper uses "w.id" — we need "t.id" for tenders.
    // Replace the table alias in the clause since the helper hardcodes "w".
    wheres.push(cursorWhere.clause.replace(/w\.id/g, "t.id"));
    params.push(...cursorWhere.params);
    paramIdx += cursorWhere.params.length;
  }

  const whereStr = wheres.join("\n      ");
  const dir = filters.sortDir;
  const limitPlus1 = filters.limit + 1;

  const dataQuery = `
    SELECT
      t.id AS "Id", t.tenderno AS "TenderNo", t.tendername AS "TenderName",
      t.client AS "Client", t.tendercategory AS "TenderCategory",
      t.closingdate AS "ClosingDate", t.estimatedvalue AS "EstimatedValue",
      t.submittedvalue AS "SubmittedValue", t.winvalue AS "WinValue",
      t.status AS "Status", t.createdat AS "CreatedAt",
      s.name AS "OwnerName"
    FROM tender t
    JOIN staff s ON s.id = t.tenderownerid
    WHERE 1=1
      ${whereStr}
    ORDER BY ${sortCol} ${dir}, t.id ${dir}
    LIMIT $${paramIdx}`;

  params.push(limitPlus1);

  const countQuery = `
    SELECT COUNT(*) AS "total"
    FROM tender t
    JOIN staff s ON s.id = t.tenderownerid
    WHERE 1=1
      ${whereStr}`;

  // Count query uses the same params minus the limit and cursor params
  const countParams = params.slice(
    0,
    params.length - 1 - cursorWhere.params.length
  );

  const [dataResult, countResult] = await Promise.all([
    query(dataQuery, params),
    query<{ total: string }>(countQuery, countParams),
  ]);

  const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
  const hasNextPage = dataResult.rows.length > filters.limit;
  const rows = dataResult.rows.slice(0, filters.limit);

  const lastRow = rows[rows.length - 1];
  const nextCursor =
    hasNextPage && lastRow
      ? encodeCursor(
          lastRow.Id as string,
          cursorValue(lastRow[sortColKey(filters.sortBy)] ?? lastRow.CreatedAt)
        )
      : null;

  return {
    rows: rows.map(mapTenderListItem),
    total,
    hasNextPage,
    nextCursor,
  };
}

function sortColKey(sortBy: string): string {
  const map: Record<string, string> = {
    tenderNo: "TenderNo",
    tenderName: "TenderName",
    client: "Client",
    closingDate: "ClosingDate",
    estimatedValue: "EstimatedValue",
    status: "Status",
    createdAt: "CreatedAt",
  };
  return map[sortBy] ?? "CreatedAt";
}

function mapTenderListItem(row: Record<string, unknown>): TenderListItem {
  return {
    id: row.Id as string,
    tenderNo: row.TenderNo as string,
    tenderName: row.TenderName as string,
    client: row.Client as string,
    tenderCategory: (row.TenderCategory as string) ?? null,
    closingDate: String(row.ClosingDate),
    estimatedValue: parseFloat(String(row.EstimatedValue)),
    submittedValue:
      row.SubmittedValue != null
        ? parseFloat(String(row.SubmittedValue))
        : null,
    winValue:
      row.WinValue != null ? parseFloat(String(row.WinValue)) : null,
    status: row.Status as string,
    ownerName: row.OwnerName as string,
    createdAt: String(row.CreatedAt),
  };
}

// ─── Summary KPIs ──────────────────────────────────────────────────────────

export interface TenderSummary {
  activeTenders: number;
  activeValue: number;
  pipelineValue: number;
  winRate: number;
  closingSoon: number;
}

export async function getTenderSummary(): Promise<TenderSummary> {
  const [statsRes, closingRes] = await Promise.all([
    query<{
      active: string;
      activeVal: string;
      pipeline: string;
      wonCount: string;
      decidedCount: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('Won','Lost','Cancelled'))::int AS "active",
         COALESCE(SUM(estimatedvalue) FILTER (WHERE status NOT IN ('Won','Lost','Cancelled')), 0)::float AS "activeVal",
         COALESCE(SUM(estimatedvalue), 0)::float AS "pipeline",
         COUNT(*) FILTER (WHERE status = 'Won')::int AS "wonCount",
         COUNT(*) FILTER (WHERE status IN ('Won','Lost'))::int AS "decidedCount"
       FROM tender`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS "count"
       FROM tender
       WHERE status NOT IN ('Won','Lost','Cancelled')
         AND closingdate BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`
    ),
  ]);

  const s = statsRes.rows[0];
  const decided = parseInt(s?.decidedCount ?? "0", 10);
  const won = parseInt(s?.wonCount ?? "0", 10);

  return {
    activeTenders: parseInt(s?.active ?? "0", 10),
    activeValue: parseFloat(s?.activeVal ?? "0"),
    pipelineValue: parseFloat(s?.pipeline ?? "0"),
    winRate: decided > 0 ? Math.round((won / decided) * 100) : 0,
    closingSoon: parseInt(closingRes.rows[0]?.count ?? "0", 10),
  };
}

// ─── Detail ─────────────────────────────────────────────────────────────────

export interface TenderDetail {
  id: string;
  tenderNo: string;
  tenderName: string;
  client: string;
  tenderCategory: string | null;
  closingDate: string;
  estimatedValue: number;
  submittedValue: number | null;
  winValue: number | null;
  status: string;
  owner: { id: string; name: string; roleCode: string };
  createdAt: string;
  updatedAt: string | null;
}

export async function getTenderById(
  id: string
): Promise<TenderDetail | null> {
  const result = await query(
    `SELECT
      t.id AS "Id", t.tenderno AS "TenderNo", t.tendername AS "TenderName",
      t.client AS "Client", t.tendercategory AS "TenderCategory",
      t.closingdate AS "ClosingDate", t.estimatedvalue AS "EstimatedValue",
      t.submittedvalue AS "SubmittedValue", t.winvalue AS "WinValue",
      t.status AS "Status", t.createdat AS "CreatedAt", t.updatedat AS "UpdatedAt",
      s.id AS "OwnerId", s.name AS "OwnerName", r.rolecode AS "OwnerRoleCode"
    FROM tender t
    JOIN staff s ON s.id = t.tenderownerid
    JOIN role r ON r.id = s.roleid
    WHERE t.id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;
  const r = result.rows[0];

  return {
    id: r.Id as string,
    tenderNo: r.TenderNo as string,
    tenderName: r.TenderName as string,
    client: r.Client as string,
    tenderCategory: (r.TenderCategory as string) ?? null,
    closingDate: String(r.ClosingDate),
    estimatedValue: parseFloat(String(r.EstimatedValue)),
    submittedValue:
      r.SubmittedValue != null
        ? parseFloat(String(r.SubmittedValue))
        : null,
    winValue:
      r.WinValue != null ? parseFloat(String(r.WinValue)) : null,
    status: r.Status as string,
    owner: {
      id: r.OwnerId as string,
      name: r.OwnerName as string,
      roleCode: r.OwnerRoleCode as string,
    },
    createdAt: String(r.CreatedAt),
    updatedAt: r.UpdatedAt ? String(r.UpdatedAt) : null,
  };
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface TenderCreateInput {
  tenderName: string;
  client: string;
  tenderCategory?: string;
  closingDate: string;
  estimatedValue: number;
  submittedValue?: number;
  tenderOwnerId: string;
  status?: string;
}

export interface TenderCreated {
  id: string;
  tenderNo: string;
  status: string;
  createdAt: string;
}

// ─── Patch ─────────────────────────────────────────────────────────────────

export interface TenderPatchInput {
  tenderName?: string;
  client?: string;
  tenderCategory?: string | null;
  closingDate?: string;
  estimatedValue?: number;
  submittedValue?: number | null;
  winValue?: number | null;
  tenderOwnerId?: string;
  status?: string;
}

export async function patchTender(
  id: string,
  input: TenderPatchInput,
  session: AuthSession
): Promise<TenderDetail | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify tender exists
    const existing = await client.query(
      `SELECT id, tendername, client, tendercategory, closingdate,
              estimatedvalue, submittedvalue, winvalue, status, tenderownerid
       FROM tender WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const old = existing.rows[0];

    // Build dynamic SET clause
    const sets: string[] = ["updatedat = now()"];
    const params: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, { col: string; oldKey: string }> = {
      tenderName: { col: "tendername", oldKey: "tendername" },
      client: { col: "client", oldKey: "client" },
      tenderCategory: { col: "tendercategory", oldKey: "tendercategory" },
      closingDate: { col: "closingdate", oldKey: "closingdate" },
      estimatedValue: { col: "estimatedvalue", oldKey: "estimatedvalue" },
      submittedValue: { col: "submittedvalue", oldKey: "submittedvalue" },
      winValue: { col: "winvalue", oldKey: "winvalue" },
      tenderOwnerId: { col: "tenderownerid", oldKey: "tenderownerid" },
      status: { col: "status", oldKey: "status" },
    };

    for (const [key, { col, oldKey }] of Object.entries(fieldMap)) {
      const val = input[key as keyof TenderPatchInput];
      if (val !== undefined) {
        sets.push(`${col} = $${idx}`);
        params.push(val);
        idx++;

        await insertAuditEntry(
          {
            entityName: "TENDER",
            entityId: id,
            action: "Update",
            fieldName: col,
            oldValue: old[oldKey] != null ? String(old[oldKey]) : null,
            newValue: val != null ? String(val) : null,
            performedBy: session.staffId,
          },
          client
        );
      }
    }

    params.push(id);
    await client.query(
      `UPDATE tender SET ${sets.join(", ")} WHERE id = $${idx}`,
      params
    );

    await client.query("COMMIT");

    return getTenderById(id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createTender(
  input: TenderCreateInput,
  session: AuthSession
): Promise<TenderCreated> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Generate TenderNo: T-DDMMYYYY-NNN
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const dateStr = `${dd}${mm}${yyyy}`;
    const prefix = `T-${dateStr}-`;

    const seqResult = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS "cnt" FROM tender WHERE tenderno LIKE $1`,
      [`${prefix}%`]
    );
    const seq = parseInt(seqResult.rows[0].cnt, 10) + 1;
    const tenderNo = `${prefix}${String(seq).padStart(3, "0")}`;

    const status = input.status ?? "Prospect";

    // 2. Insert tender
    const tenderResult = await client.query<{
      Id: string;
      CreatedAt: string;
    }>(
      `INSERT INTO tender
        (tenderno, tendername, client, tendercategory, closingdate,
         estimatedvalue, submittedvalue, tenderownerid, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id AS "Id", createdat AS "CreatedAt"`,
      [
        tenderNo,
        input.tenderName,
        input.client,
        input.tenderCategory ?? null,
        input.closingDate,
        input.estimatedValue,
        input.submittedValue ?? null,
        input.tenderOwnerId,
        status,
      ]
    );
    const tender = tenderResult.rows[0];

    // 3. Audit log
    await insertAuditEntry(
      {
        entityName: "TENDER",
        entityId: tender.Id,
        action: "Insert",
        newValue: JSON.stringify({
          tenderNo,
          tenderName: input.tenderName,
          client: input.client,
        }),
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    return {
      id: tender.Id,
      tenderNo,
      status,
      createdAt: String(tender.CreatedAt),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
