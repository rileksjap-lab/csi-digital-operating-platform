import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, badRequest, zodError, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

const registerSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email().max(150),
  deptId: z.string().uuid(),
  phone: z.string().max(20).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const { name, email, deptId } = parsed.data;

    // Check if email already exists
    const { rows: existing } = await query<{ status: string }>(
      `SELECT status AS "status" FROM staff WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );

    if (existing.length > 0) {
      const status = existing[0].status;
      if (status === "PendingApproval") {
        return badRequest("This email is already registered and pending approval");
      }
      if (status === "Rejected") {
        return badRequest("This email registration was rejected. Please contact an administrator");
      }
      return badRequest("An account with this email already exists");
    }

    // Validate department exists
    const { rows: deptRows } = await query<{ id: string }>(
      `SELECT id AS "id" FROM department WHERE id = $1`,
      [deptId]
    );
    if (deptRows.length === 0) {
      return badRequest("Invalid department");
    }

    // Get default role (Team Member)
    const { rows: roleRows } = await query<{ id: string }>(
      `SELECT id AS "id" FROM role WHERE rolecode = 'TM' LIMIT 1`,
      []
    );
    if (roleRows.length === 0) {
      return internalError("default-role-missing");
    }

    // Generate staff code: REG-YYYYMMDD-NNN
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const { rows: seqRows } = await query<{ count: string }>(
      `SELECT COUNT(*)::int AS "count" FROM staff WHERE staffcode LIKE $1`,
      [`REG-${dateStr}-%`]
    );
    const seq = (parseInt(seqRows[0].count, 10) + 1).toString().padStart(3, "0");
    const staffCode = `REG-${dateStr}-${seq}`;

    // Insert staff with PendingApproval status
    const { rows: inserted } = await query<{ id: string }>(
      `INSERT INTO staff (staffcode, name, email, roleid, deptid, status)
       VALUES ($1, $2, $3, $4, $5, 'PendingApproval')
       RETURNING id AS "id"`,
      [staffCode, name.trim(), email.trim().toLowerCase(), roleRows[0].id, deptId]
    );

    return ok({ id: inserted[0].id, message: "Registration submitted. Please wait for admin approval." });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[auth/register] POST error", err);
    return internalError("registration-failed");
  }
}
