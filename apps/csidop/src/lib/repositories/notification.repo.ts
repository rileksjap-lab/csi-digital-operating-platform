import { query } from "@/lib/db/pool";

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  category: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export async function listNotifications(
  staffId: string,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<{ items: NotificationRow[]; total: number; unreadCount: number }> {
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;

  const whereClause = opts.unreadOnly ? "AND n.isread = FALSE" : "";

  const [dataRes, countRes, unreadRes] = await Promise.all([
    query(
      `SELECT n.id, n.title, n.body, n.category, n.linkurl, n.isread, n.createdat
       FROM notification n
       WHERE n.staffid = $1 ${whereClause}
       ORDER BY n.createdat DESC
       LIMIT $2 OFFSET $3`,
      [staffId, limit, offset]
    ),
    query<{ cnt: string }>(
      `SELECT COUNT(*) AS "cnt" FROM notification WHERE staffid = $1 ${whereClause}`,
      [staffId]
    ),
    query<{ cnt: string }>(
      `SELECT COUNT(*) AS "cnt" FROM notification WHERE staffid = $1 AND isread = FALSE`,
      [staffId]
    ),
  ]);

  return {
    items: dataRes.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      body: (r.body as string) ?? null,
      category: r.category as string,
      linkUrl: (r.linkurl as string) ?? null,
      isRead: r.isread as boolean,
      createdAt: String(r.createdat),
    })),
    total: parseInt(countRes.rows[0].cnt, 10),
    unreadCount: parseInt(unreadRes.rows[0].cnt, 10),
  };
}

export async function markAsRead(
  notificationId: string,
  staffId: string
): Promise<boolean> {
  const result = await query(
    `UPDATE notification SET isread = TRUE WHERE id = $1 AND staffid = $2 AND isread = FALSE`,
    [notificationId, staffId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllAsRead(staffId: string): Promise<number> {
  const result = await query(
    `UPDATE notification SET isread = TRUE WHERE staffid = $1 AND isread = FALSE`,
    [staffId]
  );
  return result.rowCount ?? 0;
}

export async function createNotification(params: {
  staffId: string;
  title: string;
  body?: string;
  category?: string;
  linkUrl?: string;
}): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO notification (staffid, title, body, category, linkurl)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      params.staffId,
      params.title,
      params.body ?? null,
      params.category ?? "General",
      params.linkUrl ?? null,
    ]
  );
  return result.rows[0].id;
}
