// Leave rules as plain functions (no database), so the repository only loads data,
// asks these, and writes. Dates are "YYYY-MM-DD" strings throughout.

export type LeaveStatus = "PendingSM" | "PendingHOD" | "Approved" | "Rejected" | "Cancelled";
export type DayPart = "Full" | "AM" | "PM";
export type LeaveAction = "approve" | "reject" | "cancel";

const MS_DAY = 86_400_000;
const toMs = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Monday to Friday, and not a public holiday. */
export function isWorkingDay(iso: string, holidays: ReadonlySet<string>): boolean {
  const dow = new Date(toMs(iso)).getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays.has(iso);
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = toMs(start); t <= toMs(end); t += MS_DAY) out.push(toIso(t));
  return out;
}

/** Working days the leave takes: weekends and public holidays are free; a half day is 0.5. */
export function leaveDays(start: string, end: string, part: DayPart, holidays: ReadonlySet<string>): number {
  const working = eachDay(start, end).filter((d) => isWorkingDay(d, holidays)).length;
  return part === "Full" ? working : working > 0 ? 0.5 : 0;
}

/** The part of a request that falls in one calendar year (leave can run over New Year). */
export function leaveDaysInYear(start: string, end: string, part: DayPart, holidays: ReadonlySet<string>, year: number): number {
  const from = start > `${year}-01-01` ? start : `${year}-01-01`;
  const to = end < `${year}-12-31` ? end : `${year}-12-31`;
  if (from > to) return 0;
  return leaveDays(from, to, part, holidays);
}

/** Whole years of service as of a date, to one decimal (so 2.5 years counts as 2.5). */
export function yearsOfService(joinDate: string | null, asOf: string): number | null {
  if (!joinDate) return null;
  const diff = (toMs(asOf) - toMs(joinDate)) / (MS_DAY * 365.25);
  return diff < 0 ? 0 : Math.floor(diff * 10) / 10;
}

export interface EntitlementRule { minYears: number; days: number }

/** The tier with the highest "from N years" the person has reached. Null when no rule applies. */
export function entitlementFor(years: number | null, rules: EntitlementRule[]): number | null {
  if (rules.length === 0) return null;
  const y = years ?? 0;
  const hit = rules.filter((r) => r.minYears <= y).sort((a, b) => b.minYears - a.minYears)[0];
  return hit ? hit.days : null;
}

export const balanceOf = (b: { entitled: number; carriedForward: number; adjustment: number }, taken: number, pending: number) =>
  Math.round((b.entitled + b.carriedForward + b.adjustment - taken - pending) * 10) / 10;

// ── Approval route ──────────────────────────────────────────────────────────

/** Staff go to a Solution Manager first; a Solution Manager goes to the HOD; the HOD's own is just recorded. */
export function initialStatus(role: string, hasSolutionManager: boolean): LeaveStatus {
  if (role === "HOD" || role === "SVP") return "Approved";
  if (role === "SolutionManager" || !hasSolutionManager) return "PendingHOD";
  return "PendingSM";
}

export interface LeaveActor {
  staffId: string;
  role: string;
  /** A Solution Manager the HOD named to approve for them, today. */
  actingForHod: boolean;
}

export interface LeaveFacts { status: LeaveStatus; staffId: string; endDate: string }

export function allowedLeaveActions(r: LeaveFacts, a: LeaveActor, today: string): LeaveAction[] {
  const out: LeaveAction[] = [];
  const own = r.staffId === a.staffId;
  const isHod = a.role === "HOD" || a.role === "SVP";
  if (!own) {
    if (r.status === "PendingSM" && (a.role === "SolutionManager" || isHod)) out.push("approve", "reject");
    if (r.status === "PendingHOD" && (isHod || a.actingForHod)) out.push("approve", "reject");
  }
  const live = r.status === "PendingSM" || r.status === "PendingHOD" || (r.status === "Approved" && r.endDate >= today);
  if (live && (own || isHod)) out.push("cancel");
  return out;
}

/** What approving does at each stage. */
export function statusAfterApprove(status: LeaveStatus, role: string): LeaveStatus {
  if (status === "PendingSM" && role === "SolutionManager") return "PendingHOD";
  return "Approved";
}
