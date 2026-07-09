import type { NextRequest } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { ok, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";
import { sendDigestEmail } from "@/lib/email/digest";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const isCronCall = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

    // Cron-triggered (scheduled digest) OR an HOD/SM manually clicking
    // "Send Digest" on the dashboard — both are legitimate callers.
    if (!isCronCall) {
      const session = await requireAuth(request);
      requireRole(session, "HOD", "SolutionManager");
    }

    const body = await request.json().catch(() => ({}));
    const period = body.period === "daily" ? "daily" : "weekly";

    const leads = await query<{ id: string; name: string; email: string; rolecode: string }>(
      `SELECT s.id, s.name, s.email, r.rolecode
       FROM staff s
       JOIN role r ON r.id = s.roleid
       JOIN department d ON d.id = s.deptid
       WHERE r.rolecode IN ('HOD', 'SM') AND d.deptcode = 'CSI' AND s.status = 'Active'`
    );

    let sent = 0;
    for (const lead of leads.rows) {
      try {
        await sendDigestEmail(lead.id, lead.name, lead.email, period);
        sent++;
      } catch (e) {
        console.error(`[digest] sendDigestEmail failed for ${lead.name}`, e);
        throw e;
      }
    }

    return ok({ sent, period });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[digest] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
