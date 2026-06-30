import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "wo_deadline" | "tender_closing" | "cert_expiry";
  meta?: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    void session;

    const month = request.nextUrl.searchParams.get("month");
    const year = request.nextUrl.searchParams.get("year");

    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();

    const startDate = `${y}-${String(m).padStart(2, "0")}-01`;
    const endDate = m === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(m + 1).padStart(2, "0")}-01`;

    const [woEvents, tenderEvents, certEvents] = await Promise.all([
      query<{ id: string; title: string; date: string; meta: string }>(
        `SELECT id, title,
                to_char(duedate, 'YYYY-MM-DD') AS date,
                status AS meta
         FROM csi_wo
         WHERE duedate >= $1::date AND duedate < $2::date
           AND status NOT IN ('Closed', 'Cancelled')
         ORDER BY duedate`,
        [startDate, endDate]
      ),
      query<{ id: string; title: string; date: string; meta: string }>(
        `SELECT id, tendername AS title,
                to_char(closingdate, 'YYYY-MM-DD') AS date,
                status AS meta
         FROM tender
         WHERE closingdate >= $1::date AND closingdate < $2::date
           AND status NOT IN ('Won', 'Lost', 'Cancelled')
         ORDER BY closingdate`,
        [startDate, endDate]
      ),
      query<{ id: string; title: string; date: string; meta: string }>(
        `SELECT c.id, s.name || ' — ' || c.certname AS title,
                to_char(c.expirydate, 'YYYY-MM-DD') AS date,
                c.verificationstatus AS meta
         FROM certification c
         JOIN staff s ON s.id = c.staffid
         WHERE c.expirydate >= $1::date AND c.expirydate < $2::date
         ORDER BY c.expirydate`,
        [startDate, endDate]
      ),
    ]);

    const events: CalendarEvent[] = [
      ...woEvents.rows.map((r) => ({ ...r, type: "wo_deadline" as const })),
      ...tenderEvents.rows.map((r) => ({ ...r, type: "tender_closing" as const })),
      ...certEvents.rows.map((r) => ({ ...r, type: "cert_expiry" as const })),
    ];

    return ok(events);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[calendar] GET error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
