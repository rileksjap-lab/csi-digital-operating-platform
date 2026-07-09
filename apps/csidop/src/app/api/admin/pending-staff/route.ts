import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, badRequest, zodError, notFound, internalError } from "@/lib/response";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { query } from "@/lib/db/pool";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager");

    const { rows } = await query<{
      id: string;
      staffCode: string;
      name: string;
      email: string;
      deptName: string;
      deptCode: string;
      status: string;
      createdAt: string;
    }>(
      `SELECT s.id AS "id", s.staffcode AS "staffCode", s.name AS "name", s.email AS "email",
              d.deptname AS "deptName", d.deptcode AS "deptCode", s.status AS "status",
              s.createdat AS "createdAt"
       FROM staff s
       JOIN department d ON d.id = s.deptid
       WHERE s.status IN ('PendingApproval', 'Rejected')
       ORDER BY s.createdat DESC`
    );

    return ok(rows);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/pending-staff] GET error", err);
    return internalError("pending-staff-list-failed");
  }
}

const actionSchema = z.object({
  staffId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  roleId: z.string().uuid().optional(),
  subTeam: z.string().max(50).optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    requireRole(session, "HOD", "SolutionManager");

    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { staffId, action, roleId, subTeam } = parsed.data;

    // Check staff exists and is pending
    const { rows: staffRows } = await query<{ status: string; staffcode: string }>(
      `SELECT status AS "status", staffcode AS "staffcode" FROM staff WHERE id = $1`,
      [staffId]
    );
    if (staffRows.length === 0) return notFound("Staff not found");
    if (staffRows[0].status !== "PendingApproval") {
      return badRequest("Staff is not in PendingApproval status");
    }

    if (action === "approve") {
      // Generate a proper staff code replacing the REG- prefix
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const { rows: seqRows } = await query<{ count: string }>(
        `SELECT COUNT(*)::int AS "count" FROM staff WHERE staffcode LIKE $1 AND staffcode NOT LIKE 'REG-%'`,
        [`CSI-${dateStr}-%`]
      );
      const seq = (parseInt(seqRows[0].count, 10) + 1).toString().padStart(3, "0");
      const newStaffCode = `CSI-${dateStr}-${seq}`;

      const updateParts = [
        `status = 'Active'`,
        `staffcode = $2`,
      ];
      const params: (string | null)[] = [staffId, newStaffCode];
      let paramIdx = 3;

      if (roleId) {
        updateParts.push(`roleid = $${paramIdx}`);
        params.push(roleId);
        paramIdx++;
      }

      updateParts.push(`subteam = $${paramIdx}`);
      params.push(subTeam ?? null);

      await query(
        `UPDATE staff SET ${updateParts.join(", ")} WHERE id = $1`,
        params
      );

      return ok({ staffId, action: "approved", staffCode: newStaffCode });
    } else {
      await query(
        `UPDATE staff SET status = 'Rejected' WHERE id = $1`,
        [staffId]
      );
      return ok({ staffId, action: "rejected" });
    }
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/pending-staff] PATCH error", err);
    return internalError("pending-staff-action-failed");
  }
}
