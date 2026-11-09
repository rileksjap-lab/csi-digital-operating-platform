import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import { plannerFor } from "@/lib/repositories/leave.repo";

// Everyone in the department, their approved and pending leave for one month, and the public holidays.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const q = request.nextUrl.searchParams;
    const now = new Date();
    const year = Number(q.get("year") ?? now.getFullYear());
    const month = Number(q.get("month") ?? now.getMonth() + 1);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return badRequest("Invalid month");
    return ok(await plannerFor(session, year, month));
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[leave/planner] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
