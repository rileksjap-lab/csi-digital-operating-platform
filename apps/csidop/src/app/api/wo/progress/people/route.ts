import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

/** People the caller may look up on WO Progress (for the name search). */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);

    const wheres = ["s.status = 'Active'"];
    const params: unknown[] = [];
    if (scope.scope === "Self") {
      params.push(scope.staffId);
      wheres.push(`s.id = $${params.length}`);
    } else {
      params.push(scope.departmentId);
      wheres.push(`s.deptid = $${params.length}`);
      if (scope.scope === "Pod") {
        params.push(scope.subTeam);
        wheres.push(`s.subteam IS NOT DISTINCT FROM $${params.length}`);
      }
    }

    const { rows } = await query<{ id: string; name: string; subTeam: string | null; roleName: string }>(
      `SELECT s.id, s.name, s.subteam AS "subTeam", r.rolename AS "roleName"
       FROM staff s JOIN role r ON r.id = s.roleid
       WHERE ${wheres.join(" AND ")}
       ORDER BY s.name`,
      params
    );
    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[wo/progress/people] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
