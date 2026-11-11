import type { NextRequest } from "next/server";
import { ok, badRequest, internalError } from "@/lib/response";
import { listPlansDueForQuarterEndSnapshot, takePlanSnapshot } from "@/lib/repositories/cmp.repo";

/**
 * Quarter-end job. Safe to call every day: it does nothing unless today is
 * the last day of a plan quarter (Y1Q1 = Jul-Sep 2026 ... Y5Q4 = Apr-Jun 2031),
 * then snapshots every plan whose baseline is Locked or Approved.
 *
 * Same protection as /api/sla-check, except the secret is required: with
 * CRON_SECRET unset the route refuses, rather than running open.
 *
 *   55 23 * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cmp/snapshot-job
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return badRequest("Unauthorized");
    }

    const due = await listPlansDueForQuarterEndSnapshot();
    const results: { planId: string; periodCode: string; ok: boolean; error?: string }[] = [];
    for (const d of due) {
      try {
        await takePlanSnapshot(d.planId, { source: "QuarterEnd" });
        results.push({ ...d, ok: true });
      } catch (e) {
        console.error("[cmp/snapshot-job] snapshot failed", d.planId, e);
        results.push({ ...d, ok: false, error: e instanceof Response ? `HTTP ${e.status}` : "error" });
      }
    }
    return ok({ quarterEnd: due.length > 0, snapshots: results });
  } catch (err) {
    console.error("[cmp/snapshot-job] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
