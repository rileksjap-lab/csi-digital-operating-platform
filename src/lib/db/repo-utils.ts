import type { ScopeFilter } from "@/lib/auth/guards";

// ─── Cursor pagination ──────────────────────────────────────────────────────

export interface CursorPage<T> {
  rows: T[];
  total: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

export function encodeCursor(id: string, sortValue: string): string {
  return Buffer.from(JSON.stringify({ id, sv: sortValue })).toString(
    "base64url"
  );
}

export function decodeCursor(
  cursor: string
): { id: string; sv: string } | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );
    if (typeof parsed.id === "string" && typeof parsed.sv === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildCursorWhere(
  cursor: { id: string; sv: string } | null,
  sortColumn: string,
  sortDir: "asc" | "desc",
  paramOffset: number
): { clause: string; params: unknown[] } {
  if (!cursor) return { clause: "", params: [] };

  const op = sortDir === "asc" ? ">" : "<";
  const clause = `AND (${sortColumn}, w.id) ${op} ($${paramOffset}, $${paramOffset + 1})`;
  return { clause, params: [cursor.sv, cursor.id] };
}

// ─── Row-level scope filtering ──────────────────────────────────────────────

export function applyScopeFilter(
  filter: ScopeFilter,
  tableAlias: string,
  paramOffset: number
): { clause: string; params: unknown[] } {
  switch (filter.scope) {
    case "Department":
    case "Stream":
      return { clause: "", params: [] };

    case "Pod":
      return {
        clause: `AND (
          ${tableAlias}.assignedto IN (
            SELECT s.id FROM staff s
            WHERE s.deptid = $${paramOffset}
              AND s.subteam = $${paramOffset + 1}
          )
          OR ${tableAlias}.createdby = $${paramOffset + 2}
        )`,
        params: [filter.departmentId, filter.subTeam, filter.staffId],
      };

    case "Self":
      return {
        clause: `AND (
          ${tableAlias}.assignedto = $${paramOffset}
          OR ${tableAlias}.createdby = $${paramOffset}
        )`,
        params: [filter.staffId],
      };
  }
}
