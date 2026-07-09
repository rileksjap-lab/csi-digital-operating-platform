import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

export async function GET() {
  try {
    const { rows } = await query<{
      id: string;
      deptCode: string;
      deptName: string;
    }>(
      `SELECT id AS "id", deptcode AS "deptCode", deptname AS "deptName"
       FROM department
       ORDER BY deptname`
    );
    return ok(rows);
  } catch (err) {
    console.error("[auth/departments] GET error", err);
    return internalError("dept-list-failed");
  }
}
