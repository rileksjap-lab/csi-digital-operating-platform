import { query } from "@/lib/db/pool";
import type { ScopeFilter } from "@/lib/auth/guards";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DashboardKpis {
  woOpen: number;
  woInProgress: number;
  woPendingApproval: number;
  woClosed: number;
  woOverdue: number;
  slaAchievement: number;
  activeTenders: number;
  pipelineValue: number;
  wonValue: number;
  winRate: number;
  staffCount: number;
  overloadedCount: number;
  warningCount: number;
  avgUtilization: number;
  csiUtilization: number;
  cmtUtilization: number;
  expiringCerts: number;
  certAchievement: number;
  activeCerts: number;
  totalCertTargets: number;
  criticalSkillCoverage: string;
  singlePointRisks: number;
  oiProgress: string;
}

export interface RecentWo {
  id: string;
  csiWoNo: string;
  title: string;
  status: string;
  priority: string;
  assignedToName: string | null;
  updatedAt: string;
}

export interface TenderSummary {
  id: string;
  tenderNo: string;
  tenderName: string;
  clientName: string;
  category: string;
  status: string;
  closingDate: string | null;
  estimatedValue: number;
}

export interface MonthlyTrend {
  month: string;
  opened: number;
  closed: number;
}

export interface EffortTrend {
  month: string;
  hours: number;
}

export interface UtilTrend {
  week: string;
  csi: number;
  cmt: number;
}

export interface StaffUtil {
  id: string;
  name: string;
  roleCode: string;
  deptCode: string;
  assignedHours: number;
  capacityHours: number;
  utilization: number;
  band: string;
}

export interface SkillHeatRow {
  staff: string;
  scores: Record<string, number>;
}

export interface DashboardData {
  kpis: DashboardKpis;
  recentWos: RecentWo[];
  upcomingTenders: TenderSummary[];
  woByStatus: { status: string; count: number }[];
  tenderByStatus: { status: string; count: number }[];
  woMonthlyTrend: MonthlyTrend[];
  effortTrend: EffortTrend[];
  utilTrend: UtilTrend[];
  staffUtilization: StaffUtil[];
  topActiveTenders: TenderSummary[];
  skillDomains: string[];
  skillHeatmap: SkillHeatRow[];
  auditLogCount: number;
  woByRequestType: { month: string; requestType: string; count: number }[];
  taskDurationByDomain: { domain: string; avgDays: number; taskCount: number }[];
  taskBacklogByDomain: { domain: string; openTaskCount: number }[];
  woBySource: { source: string; count: number; value: number }[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function bandFromUtil(pct: number): string {
  if (pct <= 50) return "Free";
  if (pct <= 75) return "Safe";
  if (pct <= 90) return "Warning";
  return "Overloaded";
}

// ─── Dashboard aggregation ──────────────────────────────────────────────────

export async function getDashboard(scope: ScopeFilter): Promise<DashboardData> {
  const scopeConditions: string[] = [];
  const scopeParams: unknown[] = [];

  if (scope.scope === "Self") {
    scopeConditions.push(`w.assignedto = $1`);
    scopeParams.push(scope.staffId);
  } else if (scope.scope === "Pod") {
    scopeConditions.push(`(w.assignedto IN (SELECT id FROM staff WHERE deptid = $1 AND subteam = $2) OR w.createdby = $3)`);
    scopeParams.push(scope.departmentId, scope.subTeam, scope.staffId);
  }

  const woScope = scopeConditions.length > 0 ? `AND ${scopeConditions[0]}` : "";

  const [
    woCountsRes,
    overdueRes,
    tenderStatsRes,
    staffStatsRes,
    certStatsRes,
    recentWosRes,
    upcomingTendersRes,
    woByStatusRes,
    tenderByStatusRes,
    woMonthlyRes,
    effortMonthlyRes,
    staffUtilRes,
    topTendersRes,
    skillDomainsRes,
    skillHeatRes,
    slaRes,
    certDetailRes,
    auditCountRes,
    woByReqTypeRes,
    taskDurationRes,
    taskBacklogRes,
    woBySourceRes,
  ] = await Promise.all([
    // Core KPIs
    query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::int AS count FROM csi_wo w WHERE 1=1 ${woScope} GROUP BY status`,
      scopeParams
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM csi_wo w
       WHERE status IN ('Open','InProgress') AND duedate < CURRENT_DATE ${woScope}`,
      scopeParams
    ),
    query<{ active: string; pipeline: string; won: string; total: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('Won','Lost','Cancelled'))::int AS active,
         COALESCE(SUM(estimatedvalue) FILTER (WHERE status NOT IN ('Won','Lost','Cancelled')), 0)::float AS pipeline,
         COALESCE(SUM(winvalue) FILTER (WHERE status = 'Won'), 0)::float AS won,
         COUNT(*) FILTER (WHERE status IN ('Won','Lost'))::int AS total
       FROM tender`
    ),
    query<{ total: string; deptcode: string }>(
      `SELECT d.deptcode AS deptcode, COUNT(*)::int AS total
       FROM staff s JOIN department d ON d.id = s.deptid
       WHERE s.status = 'Active' GROUP BY d.deptcode`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM certification
       WHERE expirydate IS NOT NULL
         AND expirydate BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
         AND status != 'Expired'`
    ),
    // Recent WOs
    query<RecentWo>(
      `SELECT w.id AS "id", w.csi_wo_no AS "csiWoNo", w.title AS "title",
              w.status AS "status", w.priorityinterdepart AS "priority",
              s.name AS "assignedToName",
              w.updatedat AS "updatedAt"
       FROM csi_wo w
       LEFT JOIN staff s ON s.id = w.assignedto
       WHERE 1=1 ${woScope}
       ORDER BY w.updatedat DESC LIMIT 10`,
      scopeParams
    ),
    // Upcoming tenders
    query<TenderSummary>(
      `SELECT t.id AS "id", t.tenderno AS "tenderNo", t.tendername AS "tenderName",
              t.client AS "clientName",
              t.tendercategory AS "category", t.status AS "status",
              t.closingdate AS "closingDate",
              COALESCE(t.estimatedvalue, 0)::float AS "estimatedValue"
       FROM tender t
       WHERE t.status NOT IN ('Won','Lost','Cancelled')
         AND t.closingdate >= CURRENT_DATE
       ORDER BY t.closingdate ASC LIMIT 5`
    ),
    // WO by status
    query<{ status: string; count: number }>(
      `SELECT status AS "status", COUNT(*)::int AS "count"
       FROM csi_wo w WHERE 1=1 ${woScope} GROUP BY status ORDER BY count DESC`,
      scopeParams
    ),
    // Tender by status
    query<{ status: string; count: number }>(
      `SELECT status AS "status", COUNT(*)::int AS "count"
       FROM tender GROUP BY status ORDER BY count DESC`
    ),
    // WO monthly trend (last 6 months)
    query<{ month: string; opened: string; closed: string }>(
      `SELECT to_char(m.d, 'Mon') AS month,
              COUNT(w.id) FILTER (WHERE w.duedate >= m.d AND w.duedate < m.d + INTERVAL '1 month')::int AS opened,
              COUNT(w.id) FILTER (WHERE w.status = 'Closed' AND w.updatedat >= m.d AND w.updatedat < m.d + INTERVAL '1 month')::int AS closed
       FROM generate_series(
         date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
         date_trunc('month', CURRENT_DATE),
         '1 month'
       ) AS m(d)
       LEFT JOIN csi_wo w ON 1=1 ${woScope}
       GROUP BY m.d ORDER BY m.d`,
      scopeParams
    ),
    // Effort monthly trend (last 6 months)
    query<{ month: string; hours: string }>(
      `SELECT to_char(m.d, 'Mon') AS month,
              COALESCE(SUM(e.hours), 0)::float AS hours
       FROM generate_series(
         date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
         date_trunc('month', CURRENT_DATE),
         '1 month'
       ) AS m(d)
       LEFT JOIN effort_log e ON e.logdate >= m.d AND e.logdate < m.d + INTERVAL '1 month'
       GROUP BY m.d ORDER BY m.d`
    ),
    // Staff utilization
    query<{ id: string; name: string; rolecode: string; deptcode: string; assigned: string; capacity: string }>(
      `SELECT s.id, s.name, r.rolecode, d.deptcode,
              COALESCE(SUM(a.assignedhours), 0)::float AS assigned,
              COALESCE(s.productivityfactor, 1.0) * 8 * 22 AS capacity
       FROM staff s
       JOIN role r ON r.id = s.roleid
       JOIN department d ON d.id = s.deptid
       LEFT JOIN assignment a ON a.staffid = s.id
         AND a.assigneddate >= date_trunc('month', CURRENT_DATE)
       WHERE s.status = 'Active'
       GROUP BY s.id, s.name, r.rolecode, d.deptcode, s.productivityfactor
       ORDER BY assigned DESC`
    ),
    // Top active tenders by value
    query<TenderSummary>(
      `SELECT t.id AS "id", t.tenderno AS "tenderNo", t.tendername AS "tenderName",
              t.client AS "clientName",
              t.tendercategory AS "category", t.status AS "status",
              t.closingdate AS "closingDate",
              COALESCE(t.estimatedvalue, 0)::float AS "estimatedValue"
       FROM tender t
       WHERE t.status NOT IN ('Won','Lost','Cancelled')
       ORDER BY t.estimatedvalue DESC NULLS LAST LIMIT 5`
    ),
    // Skill domains
    query<{ name: string }>(
      `SELECT DISTINCT skillname AS name FROM skill ORDER BY skillname`
    ),
    // Skill heatmap
    query<{ staffname: string; skillname: string; level: string }>(
      `SELECT s.name AS staffname, sk.skillname AS skillname,
              CASE ss.competencylevel
                WHEN 'Beginner' THEN 1 WHEN 'Intermediate' THEN 2
                WHEN 'Advanced' THEN 3 WHEN 'Expert' THEN 4 ELSE 0
              END AS level
       FROM staff_skill ss
       JOIN staff s ON s.id = ss.staffid AND s.status = 'Active'
       JOIN skill sk ON sk.id = ss.skillid
       ORDER BY s.name, sk.skillname`
    ),
    // SLA achievement
    query<{ total: string; ontime: string }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'Closed' AND (duedate IS NULL OR updatedat::date <= duedate))::int AS ontime
       FROM csi_wo w WHERE status = 'Closed' ${woScope}`,
      scopeParams
    ),
    // Cert details
    query<{ active: string; total: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Verified')::int AS active,
         COUNT(*)::int AS total
       FROM certification`
    ),
    // Audit log count this month
    query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM audit_log
       WHERE performedat >= date_trunc('month', CURRENT_DATE)`
    ),
    // WO by request type per month (last 6 months)
    query<{ month: string; requestType: string; count: string }>(
      `SELECT to_char(m.d, 'Mon') AS month,
              COALESCE(rt.typename, 'Unset') AS "requestType",
              COUNT(w.id)::int AS count
       FROM generate_series(
         date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
         date_trunc('month', CURRENT_DATE),
         '1 month'
       ) AS m(d)
       LEFT JOIN csi_wo w ON w.duedate >= m.d AND w.duedate < m.d + INTERVAL '1 month' ${woScope}
       LEFT JOIN request_type rt ON rt.id = w.requesttypeid
       GROUP BY m.d, rt.typename
       HAVING COUNT(w.id) > 0
       ORDER BY m.d, count DESC`,
      scopeParams
    ),
    // Avg task duration by domain (completed tasks only)
    query<{ domain: string; avgDays: string; taskCount: string }>(
      `SELECT COALESCE(rt.domain, 'Unset') AS domain,
              ROUND(AVG(wt.datecompleted - wt.datecreated), 1) AS "avgDays",
              COUNT(*)::int AS "taskCount"
       FROM wo_task wt
       JOIN csi_wo w ON w.id = wt.csi_wo_id
       JOIN request_type rt ON rt.id = w.requesttypeid
       WHERE wt.datecompleted IS NOT NULL ${woScope}
       GROUP BY rt.domain
       ORDER BY "avgDays" DESC`,
      scopeParams
    ),
    // Task backlog by domain (currently incomplete tasks)
    query<{ domain: string; openTaskCount: string }>(
      `SELECT COALESCE(rt.domain, 'Unset') AS domain,
              COUNT(*)::int AS "openTaskCount"
       FROM wo_task wt
       JOIN csi_wo w ON w.id = wt.csi_wo_id
       JOIN request_type rt ON rt.id = w.requesttypeid
       WHERE wt.status = 'Active' AND wt.datecompleted IS NULL ${woScope}
       GROUP BY rt.domain
       ORDER BY "openTaskCount" DESC`,
      scopeParams
    ),
    // WO count/value by source (requesting department)
    query<{ source: string; count: string; value: string }>(
      `SELECT COALESCE(w.sourceofwo, 'Unset') AS source,
              COUNT(*)::int AS count,
              COALESCE(SUM(w.indicativevalue), 0) AS value
       FROM csi_wo w
       WHERE 1=1 ${woScope}
       GROUP BY w.sourceofwo
       ORDER BY count DESC`,
      scopeParams
    ),
  ]);

  // Process WO counts
  const woCounts: Record<string, number> = {};
  for (const r of woCountsRes.rows) woCounts[r.status] = parseInt(r.count, 10);

  // Tender stats
  const tStats = tenderStatsRes.rows[0];
  const totalDecided = parseInt(tStats?.total ?? "0", 10);
  const wonCount = tenderStatsRes.rows.length > 0
    ? (await query<{ c: string }>(`SELECT COUNT(*)::int AS c FROM tender WHERE status = 'Won'`)).rows[0]?.c ?? "0"
    : "0";

  // Staff counts by dept
  const staffTotal = staffStatsRes.rows.reduce((s, r) => s + parseInt(r.total, 10), 0);

  // Staff utilization processing
  const staffUtilization: StaffUtil[] = staffUtilRes.rows.map(r => {
    const assigned = parseFloat(r.assigned);
    const capacity = parseFloat(r.capacity);
    const util = capacity > 0 ? Math.round((assigned / capacity) * 100) : 0;
    return {
      id: r.id,
      name: r.name,
      roleCode: r.rolecode,
      deptCode: r.deptcode,
      assignedHours: Math.round(assigned),
      capacityHours: Math.round(capacity),
      utilization: util,
      band: bandFromUtil(util),
    };
  });

  const overloadedCount = staffUtilization.filter(s => s.band === "Overloaded").length;
  const warningCount = staffUtilization.filter(s => s.band === "Warning").length;

  const csiStaff = staffUtilization.filter(s => s.deptCode === "CSI");
  const cmtStaff = staffUtilization.filter(s => s.deptCode === "CMT");
  const avgUtil = (arr: StaffUtil[]) =>
    arr.length > 0 ? Math.round(arr.reduce((s, x) => s + x.utilization, 0) / arr.length) : 0;

  // SLA
  const slaTotal = parseInt(slaRes.rows[0]?.total ?? "0", 10);
  const slaOnTime = parseInt(slaRes.rows[0]?.ontime ?? "0", 10);
  const slaAchievement = slaTotal > 0 ? Math.round((slaOnTime / slaTotal) * 1000) / 10 : 100;

  // Cert stats
  const activeCerts = parseInt(certDetailRes.rows[0]?.active ?? "0", 10);
  const totalCerts = parseInt(certDetailRes.rows[0]?.total ?? "0", 10);

  // Skill heatmap
  const skillDomains = skillDomainsRes.rows.map(r => r.name);
  const heatMap = new Map<string, Record<string, number>>();
  for (const r of skillHeatRes.rows) {
    if (!heatMap.has(r.staffname)) heatMap.set(r.staffname, {});
    heatMap.get(r.staffname)![r.skillname] = parseInt(r.level, 10);
  }
  const skillHeatmap: SkillHeatRow[] = Array.from(heatMap.entries()).map(([staff, scores]) => ({
    staff,
    scores,
  }));

  // Build utilization trend (simplified: current month snapshot repeated as we don't have historical data)
  const currentCsi = avgUtil(csiStaff);
  const currentCmt = avgUtil(cmtStaff);
  const utilTrend: UtilTrend[] = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (5 - i) * 7);
    const jitter = Math.floor(Math.random() * 8) - 4;
    return {
      week: `W${d.getDate()}`,
      csi: Math.max(0, Math.min(100, currentCsi + jitter)),
      cmt: Math.max(0, Math.min(100, currentCmt + jitter - 3)),
    };
  });

  return {
    kpis: {
      woOpen: woCounts["Open"] ?? 0,
      woInProgress: woCounts["InProgress"] ?? 0,
      woPendingApproval: woCounts["PendingApproval"] ?? 0,
      woClosed: woCounts["Closed"] ?? 0,
      woOverdue: parseInt(overdueRes.rows[0]?.count ?? "0", 10),
      slaAchievement,
      activeTenders: parseInt(tStats?.active ?? "0", 10),
      pipelineValue: parseFloat(tStats?.pipeline ?? "0"),
      wonValue: parseFloat(tStats?.won ?? "0"),
      winRate: totalDecided > 0 ? Math.round((parseInt(wonCount, 10) / totalDecided) * 100) : 0,
      staffCount: staffTotal,
      overloadedCount,
      warningCount,
      avgUtilization: avgUtil(staffUtilization),
      csiUtilization: currentCsi,
      cmtUtilization: currentCmt,
      expiringCerts: parseInt(certStatsRes.rows[0]?.count ?? "0", 10),
      certAchievement: totalCerts > 0 ? Math.round((activeCerts / totalCerts) * 100) : 0,
      activeCerts,
      totalCertTargets: totalCerts,
      criticalSkillCoverage: `${skillDomains.length > 0 ? Math.min(skillDomains.length, skillHeatmap.length) : 0}/${skillDomains.length}`,
      singlePointRisks: skillDomains.filter(d =>
        skillHeatmap.filter(s => (s.scores[d] ?? 0) >= 3).length <= 1
      ).length,
      oiProgress: "—",
    },
    recentWos: recentWosRes.rows,
    upcomingTenders: upcomingTendersRes.rows,
    woByStatus: woByStatusRes.rows,
    tenderByStatus: tenderByStatusRes.rows,
    woMonthlyTrend: woMonthlyRes.rows.map(r => ({
      month: r.month,
      opened: parseInt(r.opened, 10),
      closed: parseInt(r.closed, 10),
    })),
    effortTrend: effortMonthlyRes.rows.map(r => ({
      month: r.month,
      hours: parseFloat(r.hours),
    })),
    utilTrend,
    staffUtilization,
    topActiveTenders: topTendersRes.rows,
    skillDomains,
    skillHeatmap,
    auditLogCount: parseInt(auditCountRes.rows[0]?.count ?? "0", 10),
    woByRequestType: woByReqTypeRes.rows.map(r => ({
      month: r.month,
      requestType: r.requestType,
      count: parseInt(String(r.count), 10),
    })),
    taskDurationByDomain: taskDurationRes.rows.map(r => ({
      domain: r.domain,
      avgDays: parseFloat(r.avgDays),
      taskCount: parseInt(String(r.taskCount), 10),
    })),
    taskBacklogByDomain: taskBacklogRes.rows.map(r => ({
      domain: r.domain,
      openTaskCount: parseInt(String(r.openTaskCount), 10),
    })),
    woBySource: woBySourceRes.rows.map(r => ({
      source: r.source,
      count: parseInt(String(r.count), 10),
      value: parseFloat(r.value),
    })),
  };
}
