import { query } from "@/lib/db/pool";
import { localTodayIso, weekdaysBetween } from "@/lib/dates";
import { KPI_METRIC_NAMES, periodToDateRange } from "@/lib/kpi/metrics";

// One grouped query per metric covering every person who has a target for the
// period, instead of one query per person per metric. A person with nothing to
// measure yet (no closed work orders, no decided tenders, ...) gets NULL
// ("no data"), not a misleading 0%.

type Values = Map<string, number | null>;

const pct = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null);

async function slaCompliance(period: string, start: string, end: string): Promise<Values> {
  // Closing date = the latest "Approved" decision. updatedat is only a
  // fallback: it changes whenever a closed WO is edited, so it can't be trusted.
  const res = await query<{ staffid: string; total: number; ontime: number }>(
    `SELECT w.assignedto AS staffid,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE w.duedate IS NULL OR c.closed::date <= w.duedate)::int AS ontime
     FROM csi_wo w
     JOIN kpi_record k ON k.staffid = w.assignedto AND k.period = $1 AND k.metricname = 'SLA Compliance %'
     CROSS JOIN LATERAL (
       SELECT COALESCE(
         (SELECT MAX(ar.decisiondate) FROM approval_record ar
           WHERE ar.csi_wo_id = w.id AND ar.decision = 'Approved'),
         w.updatedat, w.createdat) AS closed
     ) c
     WHERE w.status = 'Closed'
       AND c.closed >= $2::date AND c.closed < ($3::date + 1)
     GROUP BY w.assignedto`,
    [period, start, end]
  );
  return new Map(res.rows.map((r) => [r.staffid, pct(r.ontime, r.total)]));
}

async function completionRate(period: string, start: string, end: string): Promise<Values> {
  const res = await query<{ staffid: string; total: number; closed: number }>(
    `SELECT w.assignedto AS staffid,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE w.status = 'Closed')::int AS closed
     FROM csi_wo w
     JOIN kpi_record k ON k.staffid = w.assignedto AND k.period = $1 AND k.metricname = 'WO Completion Rate %'
     WHERE w.status <> 'Cancelled'
       AND w.createdat >= $2::date AND w.createdat < ($3::date + 1)
     GROUP BY w.assignedto`,
    [period, start, end]
  );
  return new Map(res.rows.map((r) => [r.staffid, pct(r.closed, r.total)]));
}

async function utilisation(period: string, start: string, end: string): Promise<Values> {
  const today = localTodayIso();
  if (today < start) return new Map();
  const elapsedEnd = today < end ? today : end;
  const weekdays = weekdaysBetween(start, elapsedEnd);

  const res = await query<{ staffid: string; hours: number; daily: number }>(
    `SELECT k.staffid,
            COALESCE(SUM(e.hours), 0)::float AS hours,
            (8.0 * s.productivityfactor)::float AS daily
     FROM kpi_record k
     JOIN staff s ON s.id = k.staffid
     LEFT JOIN effort_log e ON e.staffid = k.staffid AND e.logdate >= $2 AND e.logdate <= $3
     WHERE k.period = $1 AND k.metricname = 'Utilisation %'
     GROUP BY k.staffid, s.productivityfactor`,
    [period, start, end]
  );
  return new Map(res.rows.map((r) => [r.staffid, pct(r.hours, r.daily * weekdays)]));
}

async function tenderWinRate(period: string, start: string, end: string): Promise<Values> {
  const res = await query<{ staffid: string; won: number; decided: number }>(
    `SELECT w.assignedto AS staffid,
            COUNT(*) FILTER (WHERE w.tenderoutcome = 'Won')::int AS won,
            COUNT(*) FILTER (WHERE w.tenderoutcome IN ('Won','Lost'))::int AS decided
     FROM csi_wo w
     JOIN request_type rt ON rt.id = w.requesttypeid
     JOIN kpi_record k ON k.staffid = w.assignedto AND k.period = $1 AND k.metricname = 'Tender Win Rate %'
     WHERE rt.typename = 'Tender / RFP'
       AND w.tenderoutcomedate >= $2::date AND w.tenderoutcomedate < ($3::date + 1)
     GROUP BY w.assignedto`,
    [period, start, end]
  );
  return new Map(res.rows.map((r) => [r.staffid, pct(r.won, r.decided)]));
}

const CALCULATORS: Record<string, (period: string, start: string, end: string) => Promise<Values>> = {
  "SLA Compliance %": slaCompliance,
  "WO Completion Rate %": completionRate,
  "Utilisation %": utilisation,
  "Tender Win Rate %": tenderWinRate,
};

/**
 * Recalculates every achieved value for the period. Each metric is isolated:
 * one failing calculation is reported in `failed` and logged, and the rest
 * still update.
 */
export async function recomputePeriod(period: string): Promise<{ updated: number; failed: string[] }> {
  const { start, end } = periodToDateRange(period);
  let updated = 0;
  const failed: string[] = [];

  for (const metric of KPI_METRIC_NAMES) {
    try {
      const owners = await query<{ staffid: string }>(
        `SELECT staffid FROM kpi_record WHERE period = $1 AND metricname = $2`,
        [period, metric]
      );
      if (owners.rows.length === 0) continue;

      const values = await CALCULATORS[metric](period, start, end);
      const staffIds = owners.rows.map((r) => r.staffid);
      const achieved = staffIds.map((id) => {
        const v = values.get(id);
        return v === undefined || v === null ? null : Math.round(v * 100) / 100;
      });

      await query(
        `UPDATE kpi_record k
         SET achievedvalue = v.val, calculatedat = now(), updatedat = now()
         FROM (SELECT unnest($1::uuid[]) AS staffid, unnest($2::numeric[]) AS val) v
         WHERE k.staffid = v.staffid AND k.period = $3 AND k.metricname = $4`,
        [staffIds, achieved, period, metric]
      );
      updated += staffIds.length;
    } catch (err) {
      failed.push(metric);
      console.error(`[kpi] could not calculate "${metric}" for ${period}`, err);
    }
  }
  return { updated, failed };
}

/** Recalculates only if some value for the period is older than maxAgeMinutes. */
export async function refreshIfStale(period: string, maxAgeMinutes = 10): Promise<boolean> {
  const stale = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM kpi_record
     WHERE period = $1 AND metricname = ANY($2::text[])
       AND calculatedat < now() - make_interval(mins => $3::int)`,
    [period, KPI_METRIC_NAMES, maxAgeMinutes]
  );
  if ((stale.rows[0]?.n ?? 0) === 0) return false;
  await recomputePeriod(period);
  return true;
}
