import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { ok, badRequest, forbidden, notFound, internalError } from "@/lib/response";
import { balancesFor } from "@/lib/repositories/leave.repo";
import { query } from "@/lib/db/pool";

// A person's own balances; the HOD and Solution Managers can look at anyone in the department.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const q = request.nextUrl.searchParams;
    const year = Number(q.get("year") ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return badRequest("Invalid year");
    let staffId = session.staffId;
    const wanted = q.get("staffId");
    if (wanted && wanted !== session.staffId) {
      if (!z.string().uuid().safeParse(wanted).success) return badRequest("Invalid staff id");
      if (!["HOD", "SVP", "SolutionManager"].includes(session.role)) return forbidden("You can only see your own balances");
      const s = await query(`SELECT 1 FROM staff WHERE id = $1 AND deptid = $2`, [wanted, session.departmentId]);
      if (s.rows.length === 0) return notFound("Staff member not found");
      staffId = wanted;
    }
    return ok({ year, balances: await balancesFor(staffId, year) });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[leave/balances] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
