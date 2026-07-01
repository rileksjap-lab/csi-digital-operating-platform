import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import { requireSystemConfig } from "@/lib/validations/admin.schema";
import { query } from "@/lib/db/pool";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const requestTypeId = request.nextUrl.searchParams.get("requestTypeId");

    let sql = `SELECT tt.id, tt.requesttypeid AS "requestTypeId",
                      rt.typename AS "requestTypeName",
                      tt.taskname AS "taskName", tt.scope, tt.sortorder AS "sortOrder"
               FROM task_template tt
               JOIN request_type rt ON rt.id = tt.requesttypeid`;
    const params: unknown[] = [];

    if (requestTypeId) {
      sql += ` WHERE tt.requesttypeid = $1`;
      params.push(requestTypeId);
    }
    sql += ` ORDER BY rt.typename, tt.sortorder`;

    const result = await query(sql, params);
    return ok(result.rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/task-templates] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json().catch(() => ({}));
    const requestTypeId = body.requestTypeId;
    const taskName = typeof body.taskName === "string" ? body.taskName.trim() : "";
    const scope = body.scope === "External" ? "External" : "Internal";

    if (!requestTypeId) return badRequest("requestTypeId is required");
    if (!taskName || taskName.length > 500) return badRequest("taskName is required (max 500 chars)");

    const maxOrder = await query<{ max: string }>(
      `SELECT COALESCE(MAX(sortorder), 0)::int AS max FROM task_template WHERE requesttypeid = $1`,
      [requestTypeId]
    );
    const sortOrder = parseInt(maxOrder.rows[0]?.max ?? "0", 10) + 1;

    const result = await query(
      `INSERT INTO task_template (requesttypeid, taskname, scope, sortorder)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [requestTypeId, taskName, scope, sortOrder]
    );

    return ok({ id: result.rows[0].id, taskName, scope, sortOrder, requestTypeId });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/task-templates] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json().catch(() => ({}));
    const { id, taskName, scope, sortOrder } = body;
    if (!id) return badRequest("id is required");

    const sets: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (typeof taskName === "string" && taskName.trim()) {
      sets.push(`taskname = $${pi++}`);
      params.push(taskName.trim());
    }
    if (scope === "Internal" || scope === "External") {
      sets.push(`scope = $${pi++}`);
      params.push(scope);
    }
    if (typeof sortOrder === "number") {
      sets.push(`sortorder = $${pi++}`);
      params.push(sortOrder);
    }

    if (sets.length === 0) return badRequest("Nothing to update");

    params.push(id);
    await query(`UPDATE task_template SET ${sets.join(", ")} WHERE id = $${pi}`, params);
    return ok({ updated: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/task-templates] PATCH error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireSystemConfig(session);

    const body = await request.json().catch(() => ({}));
    const { id } = body;
    if (!id) return badRequest("id is required");

    await query(`DELETE FROM task_template WHERE id = $1`, [id]);
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/task-templates] DELETE error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
