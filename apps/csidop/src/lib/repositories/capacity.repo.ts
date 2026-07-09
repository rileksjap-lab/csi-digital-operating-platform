import { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";

// ─── Types ──────────────────────────────────────────────────────────────────

export type UtilizationBand = "Free" | "Safe" | "Warning" | "Overloaded";

export interface StaffUtilization {
  staffId: string;
  name: string;
  roleCode: string;
  subTeam: string | null;
  deptCode: string;
  dailyUsableHours: number;
  assignedHoursThisPeriod: number;
  workedHoursThisPeriod: number;
  remainingCapacityHours: number;
  utilizationPct: number;
  band: UtilizationBand;
  openWoCount: number;
}

export interface DepartmentSummary {
  csiUtilization: number;
  cmtUtilization: number;
  csiThreshold: number;
  cmtThreshold: number;
  csiStatus: UtilizationBand;
  cmtStatus: UtilizationBand;
}

export interface UtilizationResponse {
  departmentSummary: DepartmentSummary;
  staff: StaffUtilization[];
  cacheTimestamp: string;
}

export interface StaffUtilizationDetail extends StaffUtilization {
  effortByWo: { woId: string; csiWoNo: string; title: string; hoursWorked: number; assignedHours: number }[];
  trend: { date: string; utilizationPct: number }[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const WORKING_DAYS_PER_MONTH = 22;

function toBand(pct: number): UtilizationBand {
  if (pct < 50) return "Free";
  if (pct < 75) return "Safe";
  if (pct < 90) return "Warning";
  return "Overloaded";
}

// ─── List utilization ───────────────────────────────────────────────────────

export async function getUtilization(
  filters: { deptCode?: string; band?: string },
  scope: ScopeFilter
): Promise<UtilizationResponse> {
  const params: unknown[] = [];
  const wheres: string[] = [];
  let pi = 1;

  // Only active staff
  wheres.push(`AND s.status = 'Active'`);

  // Scope
  if (scope.scope === "Self") {
    wheres.push(`AND s.id = $${pi}`);
    params.push(scope.staffId);
    pi++;
  } else if (scope.scope === "Pod") {
    wheres.push(`AND (s.deptid = $${pi} AND s.subteam = $${pi + 1})`);
    params.push(scope.departmentId, scope.subTeam);
    pi += 2;
  }

  if (filters.deptCode) {
    wheres.push(`AND d.deptcode = $${pi}`);
    params.push(filters.deptCode);
    pi++;
  }

  const whereStr = wheres.join("\n    ");

  // Get staff with their assigned hours and worked hours for the current month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const staffResult = await query(
    `SELECT
      s.id AS "StaffId", s.name AS "Name", r.rolecode AS "RoleCode",
      s.subteam AS "SubTeam", d.deptcode AS "DeptCode",
      (8.0 * s.productivityfactor)::float AS "DailyHours",
      COALESCE(assigned.total, 0) AS "AssignedHours",
      COALESCE(worked.total, 0) AS "WorkedHours",
      COALESCE(open_wo.cnt, 0) AS "OpenWoCount"
    FROM staff s
    JOIN role r ON r.id = s.roleid
    JOIN department d ON d.id = s.deptid
    LEFT JOIN (
      SELECT a.staffid, SUM(a.assignedhours) AS total
      FROM assignment a
      JOIN csi_wo w ON w.id = a.csi_wo_id
      WHERE a.iscurrent = true AND w.status NOT IN ('Closed')
      GROUP BY a.staffid
    ) assigned ON assigned.staffid = s.id
    LEFT JOIN (
      SELECT e.staffid, SUM(e.hours) AS total
      FROM effort_log e
      WHERE e.logdate >= $${pi} AND e.logdate <= $${pi + 1}
      GROUP BY e.staffid
    ) worked ON worked.staffid = s.id
    LEFT JOIN (
      SELECT w.assignedto, COUNT(*) AS cnt
      FROM csi_wo w
      WHERE w.status IN ('Open', 'InProgress')
      GROUP BY w.assignedto
    ) open_wo ON open_wo.assignedto = s.id
    WHERE 1=1
    ${whereStr}
    ORDER BY s.name`,
    [...params, monthStart, monthEnd]
  );

  const staffRows: StaffUtilization[] = staffResult.rows.map((r) => {
    const dailyHours = parseFloat(String(r.DailyHours));
    const periodCap = dailyHours * WORKING_DAYS_PER_MONTH;
    const assigned = parseFloat(String(r.AssignedHours));
    const worked = parseFloat(String(r.WorkedHours));
    const utilizationPct = periodCap > 0
      ? Math.round((worked / periodCap) * 100)
      : 0;
    const remaining = Math.max(0, periodCap - worked);
    const band = toBand(utilizationPct);

    return {
      staffId: r.StaffId as string,
      name: r.Name as string,
      roleCode: r.RoleCode as string,
      subTeam: (r.SubTeam as string) ?? null,
      deptCode: r.DeptCode as string,
      dailyUsableHours: dailyHours,
      assignedHoursThisPeriod: assigned,
      workedHoursThisPeriod: worked,
      remainingCapacityHours: remaining,
      utilizationPct,
      band,
      openWoCount: parseInt(String(r.OpenWoCount), 10),
    };
  });

  // Filter by band if requested
  let filtered = staffRows;
  if (filters.band) {
    const bands = filters.band.split(",").map((b) => b.trim());
    filtered = staffRows.filter((s) => bands.includes(s.band));
  }

  // Department summary
  const totalWorked = staffRows.reduce((sum, s) => sum + s.workedHoursThisPeriod, 0);
  const totalCapacity = staffRows.reduce((sum, s) => sum + s.dailyUsableHours * WORKING_DAYS_PER_MONTH, 0);
  const csiUtil = totalCapacity > 0 ? Math.round((totalWorked / totalCapacity) * 100) : 0;

  const summary: DepartmentSummary = {
    csiUtilization: csiUtil,
    cmtUtilization: 0,
    csiThreshold: 85,
    cmtThreshold: 85,
    csiStatus: toBand(csiUtil),
    cmtStatus: "Free",
  };

  return {
    departmentSummary: summary,
    staff: filtered,
    cacheTimestamp: new Date().toISOString(),
  };
}

// ─── Staff detail utilization ───────────────────────────────────────────────

export async function getStaffUtilizationDetail(
  staffId: string,
  scope: ScopeFilter
): Promise<StaffUtilizationDetail | null> {
  // Verify staff exists and is in scope
  const staffRes = await query(
    `SELECT s.id AS "StaffId", s.name AS "Name", r.rolecode AS "RoleCode",
            s.subteam AS "SubTeam", d.deptcode AS "DeptCode", s.status,
            (8.0 * s.productivityfactor)::float AS "DailyHours"
     FROM staff s
     JOIN role r ON r.id = s.roleid
     JOIN department d ON d.id = s.deptid
     WHERE s.id = $1`,
    [staffId]
  );
  if (staffRes.rows.length === 0) return null;
  const staff = staffRes.rows[0];

  // Scope check
  if (scope.scope === "Self" && staffId !== scope.staffId) return null;
  if (scope.scope === "Pod") {
    const inPod = await query(
      `SELECT 1 FROM staff WHERE id = $1 AND deptid = $2 AND subteam = $3`,
      [staffId, scope.departmentId, scope.subTeam]
    );
    if (inPod.rows.length === 0 && staffId !== scope.staffId) return null;
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Effort by WO
  const effortByWoRes = await query(
    `SELECT w.id AS "WoId", w.csi_wo_no AS "CsiWoNo", w.title AS "Title",
            COALESCE(SUM(e.hours), 0) AS "HoursWorked",
            COALESCE(a.assignedhours, 0) AS "AssignedHours"
     FROM csi_wo w
     LEFT JOIN effort_log e ON e.csi_wo_id = w.id AND e.staffid = $1
       AND e.logdate >= $2 AND e.logdate <= $3
     LEFT JOIN assignment a ON a.csi_wo_id = w.id AND a.staffid = $1 AND a.iscurrent = true
     WHERE (w.assignedto = $1 OR e.staffid = $1)
       AND w.status NOT IN ('Closed')
     GROUP BY w.id, w.csi_wo_no, w.title, a.assignedhours
     ORDER BY "HoursWorked" DESC`,
    [staffId, monthStart, monthEnd]
  );

  // 30-day trend
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  const trendStart = thirtyDaysAgo.toISOString().slice(0, 10);

  const trendRes = await query(
    `SELECT e.logdate AS "LogDate", SUM(e.hours) AS "DayHours"
     FROM effort_log e
     WHERE e.staffid = $1 AND e.logdate >= $2
     GROUP BY e.logdate
     ORDER BY e.logdate`,
    [staffId, trendStart]
  );

  // Build trend array with all 30 days
  const staffDailyHours = parseFloat(String(staff.DailyHours));
  const staffPeriodCap = staffDailyHours * WORKING_DAYS_PER_MONTH;
  const trendMap = new Map<string, number>();
  for (const r of trendRes.rows) {
    trendMap.set(String(r.LogDate).slice(0, 10), parseFloat(String(r.DayHours)));
  }
  const trend: { date: string; utilizationPct: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayHours = trendMap.get(dateStr) ?? 0;
    trend.push({
      date: dateStr,
      utilizationPct: staffDailyHours > 0 ? Math.round((dayHours / staffDailyHours) * 100) : 0,
    });
  }

  // Current month totals
  const totalWorked = trendRes.rows
    .filter((r) => String(r.LogDate).slice(0, 10) >= monthStart)
    .reduce((sum, r) => sum + parseFloat(String(r.DayHours)), 0);
  const totalAssigned = effortByWoRes.rows.reduce(
    (sum, r) => sum + parseFloat(String(r.AssignedHours)), 0
  );
  const utilizationPct = staffPeriodCap > 0
    ? Math.round((totalWorked / staffPeriodCap) * 100)
    : 0;

  const openWoRes = await query(
    `SELECT COUNT(*) AS cnt FROM csi_wo WHERE assignedto = $1 AND status IN ('Open','InProgress')`,
    [staffId]
  );

  return {
    staffId,
    name: staff.Name as string,
    roleCode: staff.RoleCode as string,
    subTeam: (staff.SubTeam as string) ?? null,
    deptCode: staff.DeptCode as string,
    dailyUsableHours: staffDailyHours,
    assignedHoursThisPeriod: totalAssigned,
    workedHoursThisPeriod: totalWorked,
    remainingCapacityHours: Math.max(0, staffPeriodCap - totalWorked),
    utilizationPct,
    band: toBand(utilizationPct),
    openWoCount: parseInt(String(openWoRes.rows[0].cnt), 10),
    effortByWo: effortByWoRes.rows.map((r) => ({
      woId: r.WoId as string,
      csiWoNo: r.CsiWoNo as string,
      title: r.Title as string,
      hoursWorked: parseFloat(String(r.HoursWorked)),
      assignedHours: parseFloat(String(r.AssignedHours)),
    })),
    trend,
  };
}
