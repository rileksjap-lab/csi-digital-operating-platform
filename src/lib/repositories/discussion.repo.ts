import { query } from "@/lib/db/pool";

export interface DiscussionPost {
  id: string;
  parentId: string | null;
  postedBy: string;
  staffName: string;
  staffRoleCode: string;
  body: string;
  isEdited: boolean;
  createdAt: string;
  replies: DiscussionPost[];
}

export async function listDiscussions(woId: string): Promise<DiscussionPost[]> {
  const result = await query<{
    id: string;
    parentId: string | null;
    postedBy: string;
    staffName: string;
    staffRoleCode: string;
    body: string;
    isEdited: boolean;
    createdAt: string;
  }>(
    `SELECT d.id, d.parent_id AS "parentId", d.posted_by AS "postedBy",
            s.name AS "staffName", r.rolecode AS "staffRoleCode",
            d.body, d.is_edited AS "isEdited", d.created_at AS "createdAt"
     FROM wo_discussion d
     JOIN staff s ON s.id = d.posted_by
     JOIN role r ON r.id = s.roleid
     WHERE d.csi_wo_id = $1
     ORDER BY d.created_at ASC`,
    [woId]
  );

  const map = new Map<string, DiscussionPost>();
  const roots: DiscussionPost[] = [];

  for (const row of result.rows) {
    const post: DiscussionPost = { ...row, replies: [] };
    map.set(post.id, post);
  }

  for (const post of map.values()) {
    if (post.parentId && map.has(post.parentId)) {
      map.get(post.parentId)!.replies.push(post);
    } else {
      roots.push(post);
    }
  }

  return roots;
}

export async function createDiscussionPost(
  woId: string,
  staffId: string,
  body: string,
  parentId?: string
): Promise<{ id: string }> {
  if (parentId) {
    const parent = await query(
      `SELECT id FROM wo_discussion WHERE id = $1 AND csi_wo_id = $2`,
      [parentId, woId]
    );
    if (parent.rows.length === 0) {
      throw new Error("PARENT_NOT_FOUND");
    }
  }

  const result = await query<{ id: string }>(
    `INSERT INTO wo_discussion (csi_wo_id, parent_id, posted_by, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [woId, parentId ?? null, staffId, body]
  );

  return { id: result.rows[0].id };
}

export async function updateDiscussionPost(
  postId: string,
  staffId: string,
  body: string
): Promise<boolean> {
  const result = await query(
    `UPDATE wo_discussion
     SET body = $1, is_edited = true, updated_at = now()
     WHERE id = $2 AND posted_by = $3`,
    [body, postId, staffId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteDiscussionPost(
  postId: string,
  staffId: string,
  isLead: boolean
): Promise<boolean> {
  const where = isLead
    ? `WHERE id = $1`
    : `WHERE id = $1 AND posted_by = $2`;
  const params = isLead ? [postId] : [postId, staffId];

  const result = await query(`DELETE FROM wo_discussion ${where}`, params);
  return (result.rowCount ?? 0) > 0;
}
