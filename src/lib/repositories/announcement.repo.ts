import { query } from "@/lib/db/pool";

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
  createdBy: string;
  staffName: string;
  staffRoleCode: string;
  createdAt: string;
  expiresAt: string | null;
}

export async function listAnnouncements(opts?: {
  pinnedOnly?: boolean;
  limit?: number;
}): Promise<AnnouncementRow[]> {
  const limit = opts?.limit ?? 20;
  const pinnedFilter = opts?.pinnedOnly ? "AND a.pinned = true" : "";

  const result = await query<AnnouncementRow>(
    `SELECT a.id, a.title, a.body, a.priority, a.pinned,
            a.createdby AS "createdBy",
            s.name AS "staffName",
            r.rolecode AS "staffRoleCode",
            a.createdat AS "createdAt",
            a.expiresat AS "expiresAt"
     FROM announcement a
     JOIN staff s ON s.id = a.createdby
     JOIN role r ON r.id = s.roleid
     WHERE a.removedat IS NULL
       AND (a.expiresat IS NULL OR a.expiresat > now())
       ${pinnedFilter}
     ORDER BY a.pinned DESC, a.createdat DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
  expiresAt: string | null;
  createdBy: string;
}): Promise<{ id: string }> {
  const result = await query<{ id: string }>(
    `INSERT INTO announcement (title, body, priority, pinned, expiresat, createdby)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.title, input.body, input.priority, input.pinned, input.expiresAt, input.createdBy]
  );
  return result.rows[0];
}

export async function updateAnnouncement(
  id: string,
  input: { title?: string; body?: string; priority?: string; pinned?: boolean; expiresAt?: string | null }
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.title !== undefined) { sets.push(`title = $${idx++}`); params.push(input.title); }
  if (input.body !== undefined) { sets.push(`body = $${idx++}`); params.push(input.body); }
  if (input.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(input.priority); }
  if (input.pinned !== undefined) { sets.push(`pinned = $${idx++}`); params.push(input.pinned); }
  if (input.expiresAt !== undefined) { sets.push(`expiresat = $${idx++}`); params.push(input.expiresAt); }

  if (sets.length === 0) return;
  params.push(id);
  await query(`UPDATE announcement SET ${sets.join(", ")} WHERE id = $${idx}`, params);
}

export async function softDeleteAnnouncement(id: string, removedBy: string): Promise<void> {
  await query(
    `UPDATE announcement SET removedat = now(), removedby = $1 WHERE id = $2`,
    [removedBy, id]
  );
}
