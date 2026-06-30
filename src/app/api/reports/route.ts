import type { NextRequest } from "next/server";
import { requireAuth, buildScopeFilter } from "@/lib/auth/guards";
import type { ScopeFilter } from "@/lib/auth/guards";
import { ok, badRequest, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";

function scopeWhere(scope: ScopeFilter, staffAlias: string, offset: number): { clause: string; params: unknown[] } {
  switch (scope.scope) {
    case "Self":
      return { clause: `AND ${staffAlias}.id = $${offset}`, params: [scope.staffId] };
    case "Pod":
      return {
        clause: `AND ${staffAlias}.deptid = $${offset} AND ${staffAlias}.subteam = $${offset + 1}`,
        params: [scope.departmentId, scope.subTeam],
      };
    default:
      return { clause: "", params: [] };
  }
}

function woScopeWhere(scope: ScopeFilter, offset: number): { clause: string; params: unknown[] } {
  switch (scope.scope) {
    case "Self":
      return {
        clause: `AND (w.assignedto = $${offset} OR w.createdby = $${offset})`,
        params: [scope.staffId],
      };
    case "Pod":
      return {
        clause: `AND (w.assignedto IN (SELECT s2.id FROM staff s2 WHERE s2.deptid = $${offset} AND s2.subteam = $${offset + 1}) OR w.createdby = $${offset + 2})`,
        params: [scope.departmentId, scope.subTeam, scope.staffId],
      };
    default:
      return { clause: "", params: [] };
  }
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\r\n");
}

type ReportCode =
  | "WO_TREND"
  | "CAPACITY_UTIL"
  | "KPI_ACHIEVEMENT"
  | "OI_COMMISSION"
  | "COMPETENCY_GAP"
  | "CERT_COMPLIANCE"
  | "TENDER_PIPELINE"
  | "CMT_CSI_LINKAGE"
  | "GOVERNANCE_AUDIT"
  | "RESOURCE_CAPACITY"
  | "CHAIRMAN_SUMMARY";

async function generateReport(
  code: ReportCode,
  periodFrom: string,
  periodTo: string,
  scope: ScopeFilter
): Promise<{ headers: string[]; rows: Record<string, unknown>[]; title: string }> {
  switch (code) {
    case "WO_TREND": {
      const { clause, params } = woScopeWhere(scope, 3);
      const res = await query(
        `SELECT
           TO_CHAR(w.duedate, 'YYYY-MM') AS month,
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE w.status = 'Closed')::int AS closed,
           COUNT(*) FILTER (WHERE w.status = 'Open')::int AS open,
           COUNT(*) FILTER (WHERE w.status = 'InProgress')::int AS "inProgress",
           COUNT(*) FILTER (WHERE w.status = 'PendingApproval')::int AS "pendingApproval",
           COUNT(*) FILTER (WHERE w.status IN ('Open','InProgress') AND w.duedate < CURRENT_DATE)::int AS overdue,
           COALESCE(ROUND(
             100.0 * COUNT(*) FILTER (WHERE w.status = 'Closed' AND (w.duedate IS NULL OR w.updatedat::date <= w.duedate))
             / NULLIF(COUNT(*) FILTER (WHERE w.status = 'Closed'), 0)
           , 1), 0) AS "slaCompliancePct"
         FROM csi_wo w
         WHERE w.duedate >= $1::date AND w.duedate <= $2::date ${clause}
         GROUP BY 1 ORDER BY 1`,
        [periodFrom, periodTo, ...params]
      );
      return {
        title: "Monthly WO Trend",
        headers: ["month", "total", "closed", "open", "inProgress", "pendingApproval", "overdue", "slaCompliancePct"],
        rows: res.rows,
      };
    }

    case "CAPACITY_UTIL": {
      const { clause, params } = scopeWhere(scope, "s", 1);
      const res = await query(
        `SELECT s.name AS "staffName", r.rolecode AS "roleCode", d.deptcode AS "deptCode",
                s.subteam AS "subTeam", (8.0 * s.productivityfactor)::float AS "dailyUsableHours",
                s.productivityfactor AS "productivityFactor",
                COALESCE(asg.assigned_hours, 0) AS "assignedHours",
                COALESCE(eff.worked_hours, 0) AS "workedHours",
                COUNT(wo.id) FILTER (WHERE wo.status IN ('Open','InProgress'))::int AS "openWoCount"
         FROM staff s
         JOIN role r ON r.id = s.roleid
         JOIN department d ON d.id = s.deptid
         LEFT JOIN LATERAL (
           SELECT SUM(a.assignedhours) AS assigned_hours
           FROM assignment a
           JOIN csi_wo cw ON cw.id = a.csi_wo_id
           WHERE a.staffid = s.id AND a.iscurrent = true
             AND cw.status IN ('Open','InProgress')
         ) asg ON true
         LEFT JOIN LATERAL (
           SELECT SUM(e.hours) AS worked_hours FROM effort_log e WHERE e.staffid = s.id
         ) eff ON true
         LEFT JOIN csi_wo wo ON wo.assignedto = s.id AND wo.status IN ('Open','InProgress')
         WHERE s.status = 'Active' ${clause}
         GROUP BY s.id, s.name, r.rolecode, d.deptcode, s.subteam, s.productivityfactor, asg.assigned_hours, eff.worked_hours
         ORDER BY s.name`,
        params
      );
      return {
        title: "Capacity & Utilization",
        headers: ["staffName", "roleCode", "deptCode", "subTeam", "dailyUsableHours", "productivityFactor", "assignedHours", "workedHours", "openWoCount"],
        rows: res.rows,
      };
    }

    case "KPI_ACHIEVEMENT": {
      const { clause, params } = scopeWhere(scope, "s", 3);
      const res = await query(
        `SELECT s.name AS "staffName", r.rolecode AS "roleCode", s.subteam AS "subTeam",
                k.period, k.metricname AS "metricName",
                k.targetvalue AS "targetValue", k.achievedvalue AS "achievedValue",
                CASE WHEN k.achievedvalue >= k.targetvalue THEN 'Met' ELSE 'Not Met' END AS status,
                CASE WHEN k.targetvalue > 0
                  THEN ROUND((k.achievedvalue / k.targetvalue * 100)::numeric, 1)
                  ELSE 0 END AS "achievementPct"
         FROM kpi_record k
         JOIN staff s ON s.id = k.staffid
         JOIN role r ON r.id = k.roleid
         WHERE k.period >= $1 AND k.period <= $2 ${clause}
         ORDER BY s.name, k.period, k.metricname`,
        [periodFrom, periodTo, ...params]
      );
      return {
        title: "KPI Achievement",
        headers: ["staffName", "roleCode", "subTeam", "period", "metricName", "targetValue", "achievedValue", "status", "achievementPct"],
        rows: res.rows,
      };
    }

    case "OI_COMMISSION": {
      const { clause, params } = scopeWhere(scope, "s", 3);
      const res = await query(
        `SELECT s.name AS "staffName", r.rolecode AS "roleCode", s.subteam AS "subTeam",
                o.period, o.registered, o.won,
                CASE WHEN o.registered > 0 THEN ROUND((o.won::numeric / o.registered * 100), 1) ELSE 0 END AS "winRate"
         FROM oi_tracker o
         JOIN staff s ON s.id = o.staffid
         JOIN role r ON r.id = s.roleid
         WHERE o.period >= $1 AND o.period <= $2 ${clause}
         ORDER BY s.name, o.period`,
        [periodFrom, periodTo, ...params]
      );
      return {
        title: "OI & Commission",
        headers: ["staffName", "roleCode", "subTeam", "period", "registered", "won", "winRate"],
        rows: res.rows,
      };
    }

    case "COMPETENCY_GAP": {
      const { clause, params } = scopeWhere(scope, "s", 1);
      const res = await query(
        `SELECT s.name AS "staffName", d.deptcode AS "deptCode", s.subteam AS "subTeam",
                sk.skillname AS "skillName", sk.technologydomain AS "domain",
                ss.competencylevel AS "competencyLevel",
                ss.lastassessmentdate::text AS "lastAssessmentDate"
         FROM staff_skill ss
         JOIN staff s ON s.id = ss.staffid
         JOIN skill sk ON sk.id = ss.skillid
         JOIN department d ON d.id = s.deptid
         WHERE s.status = 'Active' ${clause}
         ORDER BY sk.technologydomain, sk.skillname, s.name`,
        params
      );
      return {
        title: "Competency Gap Analysis",
        headers: ["staffName", "deptCode", "subTeam", "skillName", "domain", "competencyLevel", "lastAssessmentDate"],
        rows: res.rows,
      };
    }

    case "CERT_COMPLIANCE": {
      const { clause, params } = scopeWhere(scope, "s", 1);
      const res = await query(
        `SELECT s.name AS "staffName", d.deptcode AS "deptCode",
                c.certificationname AS "certificationName", c.vendor,
                c.certificationlevel AS "level",
                c.issuedate::text AS "issueDate", c.expirydate::text AS "expiryDate",
                CASE
                  WHEN c.expirydate IS NULL THEN 'No Expiry'
                  WHEN c.expirydate < CURRENT_DATE THEN 'Expired'
                  WHEN c.expirydate < CURRENT_DATE + 90 THEN 'Expiring Soon'
                  ELSE 'Valid'
                END AS status
         FROM certification c
         JOIN staff s ON s.id = c.staffid
         JOIN department d ON d.id = s.deptid
         WHERE s.status = 'Active' ${clause}
         ORDER BY s.name, c.certificationname`,
        params
      );
      return {
        title: "Certification Compliance",
        headers: ["staffName", "deptCode", "certificationName", "vendor", "level", "issueDate", "expiryDate", "status"],
        rows: res.rows,
      };
    }

    case "TENDER_PIPELINE": {
      const res = await query(
        `SELECT t.tenderno AS "tenderNo", t.tendername AS "tenderName",
                t.client, t.tendercategory AS "category", t.status,
                t.closingdate::text AS "closingDate",
                t.estimatedvalue AS "estimatedValue", t.submittedvalue AS "submittedValue",
                t.winvalue AS "winValue",
                s.name AS "ownerName"
         FROM tender t
         JOIN staff s ON s.id = t.tenderownerid
         WHERE t.createdat >= $1::date AND t.createdat <= $2::date
         ORDER BY t.closingdate`,
        [periodFrom, periodTo]
      );
      return {
        title: "Tender Pipeline",
        headers: ["tenderNo", "tenderName", "client", "category", "status", "closingDate", "estimatedValue", "submittedValue", "winValue", "ownerName"],
        rows: res.rows,
      };
    }

    case "CMT_CSI_LINKAGE": {
      const { clause, params } = woScopeWhere(scope, 3);
      const res = await query(
        `SELECT e.ext_wo_no AS "extWoNo", e.extclientname AS "clientName",
                w.csi_wo_no AS "csiWoNo", w.title, w.status, w.priorityinterdepart AS "priority",
                rt.typename AS "requestType", rt.domain,
                s.name AS "assignedTo",
                w.createdat::text AS "createdAt"
         FROM external_wo e
         JOIN csi_wo w ON w.ext_wo_id = e.id
         LEFT JOIN request_type rt ON rt.id = w.requesttypeid
         LEFT JOIN staff s ON s.id = w.assignedto
         WHERE w.createdat >= $1::date AND w.createdat <= $2::date ${clause}
         ORDER BY w.createdat DESC`,
        [periodFrom, periodTo, ...params]
      );
      return {
        title: "CMT-to-CSI WO Linkage",
        headers: ["extWoNo", "clientName", "csiWoNo", "title", "status", "priority", "requestType", "domain", "assignedTo", "createdAt"],
        rows: res.rows,
      };
    }

    case "GOVERNANCE_AUDIT": {
      const res = await query(
        `SELECT al.entityname AS "entityName", al.entityid AS "entityId",
                al.action, al.fieldname AS "field",
                al.oldvalue AS "oldValue", al.newvalue AS "newValue",
                al.reason, s.name AS "performedBy",
                al.createdat::text AS "timestamp"
         FROM audit_log al
         LEFT JOIN staff s ON s.id = al.performedby
         WHERE al.createdat >= $1::timestamptz AND al.createdat <= $2::timestamptz
         ORDER BY al.createdat DESC
         LIMIT 5000`,
        [periodFrom + "T00:00:00Z", periodTo + "T23:59:59Z"]
      );
      return {
        title: "Governance & Compliance Audit Trail",
        headers: ["entityName", "entityId", "action", "field", "oldValue", "newValue", "reason", "performedBy", "timestamp"],
        rows: res.rows,
      };
    }

    case "RESOURCE_CAPACITY": {
      const { clause, params } = scopeWhere(scope, "s", 1);
      const res = await query(
        `WITH staff_capacity AS (
           SELECT s.id, s.name, r.rolecode, d.deptcode, s.subteam,
                  (8.0 * s.productivityfactor) AS dailyusablehours, s.productivityfactor,
                  (8.0 * s.productivityfactor * 22) AS monthly_capacity_hrs,
                  COALESCE(rs.percentage, 0) AS role_split_pct
           FROM staff s
           JOIN role r ON r.id = s.roleid
           JOIN department d ON d.id = s.deptid
           LEFT JOIN role_split rs ON rs.deptid = s.deptid AND rs.roleid = s.roleid
           WHERE s.status = 'Active' ${clause}
         ),
         staff_load AS (
           SELECT sc.id,
                  COALESCE(SUM(a.assignedhours) FILTER (WHERE cw.status IN ('Open','InProgress')), 0) AS assigned_hours,
                  COALESCE(SUM(e.hours), 0) AS worked_hours,
                  COUNT(DISTINCT cw.id) FILTER (WHERE cw.status IN ('Open','InProgress')) AS open_wo_count
           FROM staff_capacity sc
           LEFT JOIN assignment a ON a.staffid = sc.id AND a.iscurrent = true
           LEFT JOIN csi_wo cw ON cw.id = a.csi_wo_id
           LEFT JOIN effort_log e ON e.staffid = sc.id
             AND e.logdate >= $${params.length + 1}::date AND e.logdate <= $${params.length + 2}::date
           GROUP BY sc.id
         )
         SELECT sc.name AS "staffName", sc.rolecode AS "roleCode", sc.deptcode AS "deptCode",
                sc.subteam AS "subTeam", sc.dailyusablehours AS "dailyHours",
                sc.productivityfactor AS "prodFactor",
                ROUND(sc.monthly_capacity_hrs::numeric, 1) AS "monthlyCapacityHrs",
                sc.role_split_pct AS "roleSplitPct",
                ROUND(sl.assigned_hours::numeric, 1) AS "assignedHours",
                ROUND(sl.worked_hours::numeric, 1) AS "workedHours",
                sl.open_wo_count AS "openWoCount",
                CASE WHEN sc.monthly_capacity_hrs > 0
                  THEN ROUND((sl.assigned_hours / sc.monthly_capacity_hrs * 100)::numeric, 1)
                  ELSE 0 END AS "utilizationPct",
                ROUND((sc.monthly_capacity_hrs - sl.assigned_hours)::numeric, 1) AS "availableHours",
                CASE
                  WHEN sc.monthly_capacity_hrs > 0 AND (sl.assigned_hours / sc.monthly_capacity_hrs) > 1.0 THEN 'Overloaded'
                  WHEN sc.monthly_capacity_hrs > 0 AND (sl.assigned_hours / sc.monthly_capacity_hrs) > 0.85 THEN 'Warning'
                  WHEN sc.monthly_capacity_hrs > 0 AND (sl.assigned_hours / sc.monthly_capacity_hrs) > 0.5 THEN 'Optimal'
                  ELSE 'Under-utilized'
                END AS "band"
         FROM staff_capacity sc
         LEFT JOIN staff_load sl ON sl.id = sc.id
         ORDER BY sc.deptcode, sc.name`,
        [...params, periodFrom, periodTo]
      );
      return {
        title: "Resource Capacity Report",
        headers: ["staffName", "roleCode", "deptCode", "subTeam", "dailyHours", "prodFactor", "monthlyCapacityHrs", "roleSplitPct", "assignedHours", "workedHours", "openWoCount", "utilizationPct", "availableHours", "band"],
        rows: res.rows,
      };
    }

    case "CHAIRMAN_SUMMARY": {
      const woStats = await query(
        `SELECT
           COUNT(*)::int AS "totalWo",
           COUNT(*) FILTER (WHERE status = 'Open')::int AS "openWo",
           COUNT(*) FILTER (WHERE status = 'InProgress')::int AS "inProgressWo",
           COUNT(*) FILTER (WHERE status = 'PendingApproval')::int AS "pendingWo",
           COUNT(*) FILTER (WHERE status = 'Closed')::int AS "closedWo",
           COUNT(*) FILTER (WHERE status IN ('Open','InProgress') AND duedate < CURRENT_DATE)::int AS "overdueWo",
           COALESCE(ROUND(
             100.0 * COUNT(*) FILTER (WHERE status = 'Closed' AND (duedate IS NULL OR updatedat::date <= duedate))
             / NULLIF(COUNT(*) FILTER (WHERE status = 'Closed'), 0)
           , 1), 0) AS "slaCompliancePct"
         FROM csi_wo
         WHERE createdat >= $1::date AND createdat <= $2::date`,
        [periodFrom, periodTo]
      );
      const tenderStats = await query(
        `SELECT
           COUNT(*)::int AS "totalTenders",
           COUNT(*) FILTER (WHERE status IN ('Active','Submitted'))::int AS "activeTenders",
           COUNT(*) FILTER (WHERE status = 'Won')::int AS "wonTenders",
           COUNT(*) FILTER (WHERE status = 'Lost')::int AS "lostTenders",
           COALESCE(SUM(estimatedvalue) FILTER (WHERE status IN ('Active','Submitted')), 0) AS "pipelineValue",
           COALESCE(SUM(winvalue) FILTER (WHERE status = 'Won'), 0) AS "wonValue",
           CASE WHEN COUNT(*) FILTER (WHERE status IN ('Won','Lost')) > 0
             THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'Won') / COUNT(*) FILTER (WHERE status IN ('Won','Lost')), 1)
             ELSE 0 END AS "winRate"
         FROM tender
         WHERE createdat >= $1::date AND createdat <= $2::date`,
        [periodFrom, periodTo]
      );
      const staffStats = await query(
        `SELECT
           COUNT(*)::int AS "totalActive",
           COUNT(*) FILTER (WHERE s.subteam IS NOT NULL) AS "withSubTeam",
           COUNT(DISTINCT d.id) AS "deptCount",
           COALESCE(ROUND(AVG(s.productivityfactor)::numeric, 2), 0) AS "avgProdFactor"
         FROM staff s JOIN department d ON d.id = s.deptid
         WHERE s.status = 'Active'`
      );
      const kpiStats = await query(
        `SELECT
           COUNT(*)::int AS "totalMetrics",
           COUNT(*) FILTER (WHERE achievedvalue >= targetvalue)::int AS "metKpis",
           COUNT(*) FILTER (WHERE achievedvalue < targetvalue)::int AS "unmetKpis",
           CASE WHEN COUNT(*) > 0
             THEN ROUND(100.0 * COUNT(*) FILTER (WHERE achievedvalue >= targetvalue) / COUNT(*), 1)
             ELSE 0 END AS "achievementRate"
         FROM kpi_record
         WHERE period >= $1 AND period <= $2`,
        [periodFrom, periodTo]
      );
      const wo = woStats.rows[0] ?? {};
      const td = tenderStats.rows[0] ?? {};
      const st = staffStats.rows[0] ?? {};
      const kp = kpiStats.rows[0] ?? {};
      const rows = [
        { section: "Work Orders", metric: "Total", value: wo.totalWo },
        { section: "Work Orders", metric: "Open", value: wo.openWo },
        { section: "Work Orders", metric: "In Progress", value: wo.inProgressWo },
        { section: "Work Orders", metric: "Pending Approval", value: wo.pendingWo },
        { section: "Work Orders", metric: "Closed", value: wo.closedWo },
        { section: "Work Orders", metric: "Overdue", value: wo.overdueWo },
        { section: "Work Orders", metric: "SLA Compliance %", value: wo.slaCompliancePct },
        { section: "Tender Pipeline", metric: "Total Tenders", value: td.totalTenders },
        { section: "Tender Pipeline", metric: "Active/Submitted", value: td.activeTenders },
        { section: "Tender Pipeline", metric: "Won", value: td.wonTenders },
        { section: "Tender Pipeline", metric: "Lost", value: td.lostTenders },
        { section: "Tender Pipeline", metric: "Pipeline Value (RM)", value: td.pipelineValue },
        { section: "Tender Pipeline", metric: "Won Value (RM)", value: td.wonValue },
        { section: "Tender Pipeline", metric: "Win Rate %", value: td.winRate },
        { section: "Staff & Capacity", metric: "Active Staff", value: st.totalActive },
        { section: "Staff & Capacity", metric: "Departments", value: st.deptCount },
        { section: "Staff & Capacity", metric: "Avg Productivity Factor", value: st.avgProdFactor },
        { section: "KPI Performance", metric: "Total Metrics", value: kp.totalMetrics },
        { section: "KPI Performance", metric: "Met", value: kp.metKpis },
        { section: "KPI Performance", metric: "Not Met", value: kp.unmetKpis },
        { section: "KPI Performance", metric: "Achievement Rate %", value: kp.achievementRate },
      ];
      return {
        title: "Chairman Summary Report",
        headers: ["section", "metric", "value"],
        rows,
      };
    }

    default:
      return { title: "Unknown", headers: [], rows: [] };
  }
}

export async function GET() {
  return ok(
    [
      "WO_TREND", "CAPACITY_UTIL", "CMT_CSI_LINKAGE", "GOVERNANCE_AUDIT",
      "KPI_ACHIEVEMENT", "OI_COMMISSION", "RESOURCE_CAPACITY", "COMPETENCY_GAP",
      "CERT_COMPLIANCE", "TENDER_PIPELINE", "CHAIRMAN_SUMMARY",
    ].map((code) => ({ code, available: true }))
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const scope = buildScopeFilter(session);
    const body = await request.json();

    const { reportCode, periodFrom, periodTo, format } = body as {
      reportCode?: string;
      periodFrom?: string;
      periodTo?: string;
      format?: string;
    };

    if (!reportCode) return badRequest("reportCode is required");
    if (!periodFrom || !periodTo) return badRequest("periodFrom and periodTo are required");

    const outFormat = (format ?? "CSV").toUpperCase();
    if (!["CSV", "JSON"].includes(outFormat)) {
      return badRequest("Only CSV and JSON formats are available. PDF/PPTX require the FastAPI compute worker.");
    }

    const { headers, rows, title } = await generateReport(
      reportCode as ReportCode,
      periodFrom,
      periodTo,
      scope
    );

    if (outFormat === "CSV") {
      const csv = toCsv(headers, rows);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${reportCode}_${periodFrom}_${periodTo}.csv"`,
        },
      });
    }

    return ok({ title, reportCode, periodFrom, periodTo, rowCount: rows.length, data: rows });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[reports] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
