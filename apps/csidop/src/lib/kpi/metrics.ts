import { quarterRange } from "@/lib/dates";

// The KPIs CSIDOP calculates itself from recorded work. Targets are set per
// person by the HOD; achieved values are never typed in (see KPI_RECORD).
export const KPI_METRICS = [
  {
    name: "SLA Compliance %",
    description: "Closed work orders finished on or before their due date, by the date they were approved/closed.",
  },
  {
    name: "WO Completion Rate %",
    description: "Work orders assigned to the person during the period (excluding cancelled) that are now closed.",
  },
  {
    name: "Utilisation %",
    description: "Logged effort hours against capacity (8h x productivity factor per weekday) for the weekdays elapsed so far.",
  },
  {
    name: "Tender Win Rate %",
    description: "Tender / RFP work orders the person owned (as OO) that were marked Won, out of those decided in the period.",
  },
] as const;

export type KpiMetricName = (typeof KPI_METRICS)[number]["name"];
export const KPI_METRIC_NAMES: string[] = KPI_METRICS.map((m) => m.name);

export const PERIOD_PATTERN = /^\d{4}-Q[1-4]$/;

export function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}

export function periodToDateRange(period: string): { start: string; end: string } {
  const match = period.match(/^(\d{4})-Q([1-4])$/);
  if (!match) throw new Error(`Invalid period format: ${period}`);
  return quarterRange(parseInt(match[1], 10), parseInt(match[2], 10));
}
