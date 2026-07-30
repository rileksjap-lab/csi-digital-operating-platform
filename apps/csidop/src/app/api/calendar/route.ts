import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { getCalendarEvents } from "@/lib/repositories/calendar.repo";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);

    const month = request.nextUrl.searchParams.get("month");
    const year = request.nextUrl.searchParams.get("year");

    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();

    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    const events = await getCalendarEvents(startDate, endDate, scope);
    return ok(events);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[calendar] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
