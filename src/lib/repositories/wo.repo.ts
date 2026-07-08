import pool, { query } from "@/lib/db/pool";
import type { PoolClient } from "pg";
import type { ScopeFilter } from "@/lib/auth/guards";
import type { AuthSession } from "@/lib/types/api";
import {
  type CursorPage,
  encodeCursor,
  decodeCursor,
  buildCursorWhere,
  applyScopeFilter,
  cursorValue,
} from "@/lib/db/repo-utils";
import { insertAuditEntry } from "@/lib/db/audit";
import {
  notifyWoAssigned,
  notifyWoReassigned,
  notifyWoPendingApproval,
  notifyWoApproved,
  notifyWoReturned,
} from "@/lib/email/notify";

// ─── List types ─────────────────────────────────────────────────────────────

export type SlaStatus = "OnTime" | "Warning" | "Breached";

export interface WoListItem {
  id: string;
  csiWoNo: string;
  extWoNo: string | null;
  tenderNo: string | null;
  title: string;
  domain: string;
  requestTypeName: string;
  priority: string;
  sourceOfWO: string | null;
  slaWorkingDays: number | null;
  tierCode: number;
  tierName: string;
  assignedToName: string | null;
  dueDate: string | null;
  slaDaysRemaining: number | null;
  slaStatus: SlaStatus | null;
  status: string;
  effortHoursTotal: number;
  evidenceCount: number;
  progressPercent: number;
  createdAt: string;
}

export interface WoListFilters {
  status?: string;
  domain?: string;
  requestTypeId?: string;
  tierId?: string;
  tenderId?: string;
  assignedTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  q?: string;
  sourceType?: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  limit: number;
  after?: string;
}

const SORT_MAP: Record<string, string> = {
  csiWoNo: "w.csi_wo_no",
  title: "w.title",
  priority: "w.priorityinterdepart",
  dueDate: "w.duedate",
  status: "w.status",
  createdAt: "w.createdat",
};

export async function listWorkOrders(
  filters: WoListFilters,
  scope: ScopeFilter
): Promise<CursorPage<WoListItem>> {
  const params: unknown[] = [];
  const wheres: string[] = [];
  let paramIdx = 1;

  // Scope filter
  const sf = applyScopeFilter(scope, "w", paramIdx);
  if (sf.clause) {
    wheres.push(sf.clause);
    params.push(...sf.params);
    paramIdx += sf.params.length;
  }

  // Optional filters
  if (filters.status) {
    const statuses = filters.status.split(",").map((s) => s.trim());
    wheres.push(`AND w.status = ANY($${paramIdx}::varchar[])`);
    params.push(statuses);
    paramIdx++;
  }
  if (filters.domain) {
    wheres.push(`AND rt.domain = $${paramIdx}`);
    params.push(filters.domain);
    paramIdx++;
  }
  if (filters.requestTypeId) {
    wheres.push(`AND w.requesttypeid = $${paramIdx}`);
    params.push(filters.requestTypeId);
    paramIdx++;
  }
  if (filters.tierId) {
    wheres.push(`AND w.tierid = $${paramIdx}`);
    params.push(filters.tierId);
    paramIdx++;
  }
  if (filters.tenderId) {
    wheres.push(`AND w.tenderid = $${paramIdx}`);
    params.push(filters.tenderId);
    paramIdx++;
  }
  if (filters.assignedTo === "unassigned") {
    wheres.push(`AND w.assignedto IS NULL`);
  } else if (filters.assignedTo) {
    wheres.push(`AND w.assignedto = $${paramIdx}`);
    params.push(filters.assignedTo);
    paramIdx++;
  }
  if (filters.dueDateFrom) {
    wheres.push(`AND w.duedate >= $${paramIdx}`);
    params.push(filters.dueDateFrom);
    paramIdx++;
  }
  if (filters.dueDateTo) {
    wheres.push(`AND w.duedate <= $${paramIdx}`);
    params.push(filters.dueDateTo);
    paramIdx++;
  }
  if (filters.q) {
    wheres.push(
      `AND (w.title ILIKE $${paramIdx} OR w.csi_wo_no ILIKE $${paramIdx} OR w.remark ILIKE $${paramIdx})`
    );
    params.push(`%${filters.q}%`);
    paramIdx++;
  }
  if (filters.sourceType) {
    if (filters.sourceType === "internal") {
      wheres.push(`AND w.extwo_id IS NULL`);
    } else if (filters.sourceType === "external") {
      wheres.push(`AND w.extwo_id IS NOT NULL`);
    } else {
      wheres.push(`AND w.sourceofwo = $${paramIdx}`);
      params.push(filters.sourceType);
      paramIdx++;
    }
  }

  // Cursor — kept separate so the count query excludes it
  const sortCol = SORT_MAP[filters.sortBy] ?? "w.createdat";
  const cursor = filters.after ? decodeCursor(filters.after) : null;
  const cursorWhere = buildCursorWhere(
    cursor,
    sortCol,
    filters.sortDir,
    paramIdx
  );

  // filterWhereStr: no cursor (for count — total across all pages)
  const filterWhereStr = wheres.join("\n      ");
  // dataWhereStr: includes cursor (for current page)
  const dataWhereStr = cursorWhere.clause
    ? [...wheres, cursorWhere.clause].join("\n      ")
    : filterWhereStr;

  const dir = filters.sortDir;
  const limitPlus1 = filters.limit + 1;

  // Count params: only filter params (no cursor, no limit)
  const countParams = [...params];

  // Add cursor params for the data query
  if (cursorWhere.params.length) {
    params.push(...cursorWhere.params);
    paramIdx += cursorWhere.params.length;
  }

  const dataQuery = `
    SELECT
      w.id AS "Id", w.csi_wo_no AS "CSI_WO_No", ew.extwo_no AS "ExtWO_No", t.tenderno AS "TenderNo",
      w.title AS "Title", rt.domain AS "Domain", rt.typename AS "RequestTypeName",
      w.priorityinterdepart AS "Priority", w.sourceofwo AS "SourceOfWO",
      w.slaworkingdays AS "SLAWorkingDays",
      ct.tiercode AS "TierCode", ct.tiername AS "TierName",
      sa.name AS "AssignedToName",
      w.duedate AS "DueDate", w.status AS "Status", w.createdat AS "CreatedAt",
      (rt.slaackdays + rt.slaclassifydays + rt.slaroutedays) AS "SlaTotalDays",
      COALESCE((SELECT SUM(e.hours) FROM effort_log e WHERE e.csi_wo_id = w.id), 0) AS "EffortTotal",
      (SELECT COUNT(*) FROM evidence_deliverable ed WHERE ed.csi_wo_id = w.id AND ed.removedat IS NULL) AS "EvidenceCount",
      COALESCE((SELECT ROUND(AVG(wt.progress)) FROM wo_task wt WHERE wt.csi_wo_id = w.id AND wt.status = 'Active'), 0) AS "ProgressPercent"
    FROM csi_wo w
    JOIN request_type rt ON rt.id = w.requesttypeid
    JOIN complexity_tier ct ON ct.id = w.tierid
    LEFT JOIN external_wo ew ON ew.id = w.extwo_id
    LEFT JOIN staff sa ON sa.id = w.assignedto
    LEFT JOIN tender t ON t.id = w.tenderid
    WHERE 1=1
      ${dataWhereStr}
    ORDER BY ${sortCol} ${dir}, w.id ${dir}
    LIMIT $${paramIdx}`;

  params.push(limitPlus1);

  const countQuery = `
    SELECT COUNT(*) AS "total"
    FROM csi_wo w
    JOIN request_type rt ON rt.id = w.requesttypeid
    JOIN complexity_tier ct ON ct.id = w.tierid
    LEFT JOIN external_wo ew ON ew.id = w.extwo_id
    LEFT JOIN staff sa ON sa.id = w.assignedto
    LEFT JOIN tender t ON t.id = w.tenderid
    WHERE 1=1
      ${filterWhereStr}`;

  const [dataResult, countResult] = await Promise.all([
    query(dataQuery, params),
    query<{ total: string }>(countQuery, countParams),
  ]);

  const total = parseInt(countResult.rows[0]?.total ?? "0", 10);
  const hasNextPage = dataResult.rows.length > filters.limit;
  const rows = dataResult.rows.slice(0, filters.limit);

  const lastRow = rows[rows.length - 1];
  const nextCursor = hasNextPage && lastRow
    ? encodeCursor(
        lastRow.Id as string,
        cursorValue(lastRow[sortColKey(filters.sortBy)] ?? lastRow.CreatedAt)
      )
    : null;

  return {
    rows: rows.map(mapWoListItem),
    total,
    hasNextPage,
    nextCursor,
  };
}

function sortColKey(sortBy: string): string {
  const map: Record<string, string> = {
    csiWoNo: "CSI_WO_No",
    title: "Title",
    priority: "Priority",
    dueDate: "DueDate",
    status: "Status",
    createdAt: "CreatedAt",
  };
  return map[sortBy] ?? "CreatedAt";
}

function addWorkingDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

function countWorkingDays(from: Date, to: Date): number {
  const startDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endDate = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  if (startDate >= endDate) {
    let count = 0;
    const cursor = new Date(endDate);
    while (cursor < startDate) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) count--;
      cursor.setDate(cursor.getDate() + 1);
    }
    return count;
  }
  let count = 0;
  const cursor = new Date(startDate);
  while (cursor < endDate) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export function computeSla(
  createdAt: unknown,
  slaTotalDays: unknown,
  status: string
): { slaDaysRemaining: number | null; slaStatus: SlaStatus | null } {
  if (status === "Closed") return { slaDaysRemaining: null, slaStatus: null };
  const total = Number(slaTotalDays);
  if (!total || isNaN(total)) return { slaDaysRemaining: null, slaStatus: null };

  const created = new Date(String(createdAt));
  const deadline = addWorkingDays(created, total);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deadlineDate = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());

  const daysRemaining = countWorkingDays(today, deadlineDate);

  let slaStatus: SlaStatus;
  if (daysRemaining < 0) slaStatus = "Breached";
  else if (daysRemaining <= 1) slaStatus = "Warning";
  else slaStatus = "OnTime";

  return { slaDaysRemaining: daysRemaining, slaStatus };
}

function mapWoListItem(row: Record<string, unknown>): WoListItem {
  const status = row.Status as string;
  const slaDays = row.SLAWorkingDays ?? row.SlaTotalDays;
  const { slaDaysRemaining, slaStatus } = computeSla(row.CreatedAt, slaDays, status);

  return {
    id: row.Id as string,
    csiWoNo: row.CSI_WO_No as string,
    extWoNo: (row.ExtWO_No as string) ?? null,
    tenderNo: (row.TenderNo as string) ?? null,
    title: row.Title as string,
    domain: row.Domain as string,
    requestTypeName: row.RequestTypeName as string,
    priority: row.Priority as string,
    sourceOfWO: (row.SourceOfWO as string) ?? null,
    slaWorkingDays: row.SLAWorkingDays != null ? Number(row.SLAWorkingDays) : null,
    tierCode: Number(row.TierCode),
    tierName: row.TierName as string,
    assignedToName: (row.AssignedToName as string) ?? null,
    dueDate: row.DueDate ? String(row.DueDate) : null,
    slaDaysRemaining,
    slaStatus,
    status,
    effortHoursTotal: parseFloat(String(row.EffortTotal)),
    evidenceCount: parseInt(String(row.EvidenceCount), 10),
    progressPercent: parseInt(String(row.ProgressPercent ?? 0), 10),
    createdAt: String(row.CreatedAt),
  };
}

// ─── Detail ─────────────────────────────────────────────────────────────────

export interface WoTaskItem {
  id: string;
  taskNo: number;
  description: string;
  assignedToId: string | null;
  assignedToName: string | null;
  progress: number;
  scope: string;
  status: string;
  dateCreated: string;
  dateCompleted: string | null;
}

export interface WoDetail {
  id: string;
  csiWoNo: string;
  extWoNo: string | null;
  sourceOfWO: string | null;
  tenderOrProjectCode: string | null;
  tender: { id: string; tenderNo: string; tenderName: string; status: string } | null;
  requestType: { id: string; typeCode: number; typeName: string; domain: string };
  tier: { id: string; tierCode: number; tierName: string };
  priorityInterdepart: string;
  priorityInternal: string | null;
  title: string;
  indicativeValue: number | null;
  complexityValue: number | null;
  taskScore: number | null;
  slaWorkingDays: number | null;
  dueDate: string | null;
  slaDaysRemaining: number | null;
  slaStatus: SlaStatus | null;
  status: string;
  requesterName: string | null;
  remark: string | null;
  monitoringStaff: { id: string; name: string } | null;
  progressPercent: number;
  createdAt: string;
  updatedAt: string | null;
  createdBy: { id: string; name: string; roleCode: string };
  assignedTo: { id: string; name: string; roleCode: string; subTeam: string | null } | null;
  tasks: WoTaskItem[];
  assignmentHistory: AssignmentItem[];
  effortLog: EffortItem[];
  evidenceItems: EvidenceItem[];
  approvalTrail: ApprovalItem[];
  activityLog: ActivityItem[];
}

interface ActivityItem {
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  performedAt: string;
  performedByName: string;
}

interface AssignmentItem {
  assignedTo: string;
  assignedBy: string;
  assignedHours: number;
  assignedDate: string;
  isCurrent: boolean;
  reassignReason: string | null;
}

interface EffortItem {
  id: string;
  staffName: string;
  logDate: string;
  hours: number;
  notes: string | null;
  loggedByName: string | null;
}

interface EvidenceItem {
  id: string;
  fileRef: string;
  evidenceType: string;
  uploadedByName: string;
  uploadedDate: string;
}

interface ApprovalItem {
  tierCode: number;
  tierName: string;
  approvedByName: string;
  decision: string;
  reason: string | null;
  decisionDate: string;
}

export async function getWorkOrderById(
  id: string,
  scope: ScopeFilter
): Promise<WoDetail | null> {
  let paramIdx = 2; // $1 = id
  const scopeF = applyScopeFilter(scope, "w", paramIdx);

  const mainResult = await query(
    `SELECT
      w.id AS "Id", w.csi_wo_no AS "CSI_WO_No", ew.extwo_no AS "ExtWO_No",
      w.title AS "Title", w.priorityinterdepart AS "PriorityInterdepart",
      w.priorityinternal AS "PriorityInternal", w.status AS "Status",
      w.sourceofwo AS "SourceOfWO", w.requestername AS "RequesterName", w.tenderorprojectcode AS "TenderOrProjectCode",
      w.slaworkingdays AS "SLAWorkingDays", w.remark AS "Remark",
      w.indicativevalue AS "IndicativeValue", w.complexityvalue AS "ComplexityValue", w.taskscore AS "TaskScore",
      w.duedate AS "DueDate", w.createdat AS "CreatedAt", w.updatedat AS "UpdatedAt",
      rt.id AS "RtId", rt.typecode AS "TypeCode", rt.typename AS "TypeName", rt.domain AS "Domain",
      ct.id AS "CtId", ct.tiercode AS "TierCode", ct.tiername AS "TierName",
      (rt.slaackdays + rt.slaclassifydays + rt.slaroutedays) AS "SlaTotalDays",
      cs.id AS "CreatorId", cs.name AS "CreatorName", cr.rolecode AS "CreatorRoleCode",
      sa.id AS "AssigneeId", sa.name AS "AssigneeName",
      sr.rolecode AS "AssigneeRoleCode", sa.subteam AS "AssigneeSubTeam",
      t.id AS "TenderId", t.tenderno AS "TenderNo", t.tendername AS "TenderName", t.status AS "TenderStatus",
      ms.id AS "MonitorId", ms.name AS "MonitorName"
    FROM csi_wo w
    LEFT JOIN external_wo ew ON ew.id = w.extwo_id
    JOIN request_type rt ON rt.id = w.requesttypeid
    JOIN complexity_tier ct ON ct.id = w.tierid
    JOIN staff cs ON cs.id = w.createdby
    JOIN role cr ON cr.id = cs.roleid
    LEFT JOIN staff sa ON sa.id = w.assignedto
    LEFT JOIN role sr ON sr.id = sa.roleid
    LEFT JOIN tender t ON t.id = w.tenderid
    LEFT JOIN staff ms ON ms.id = w.monitoringstaffid
    WHERE w.id = $1
      ${scopeF.clause}`,
    [id, ...scopeF.params]
  );

  if (mainResult.rows.length === 0) return null;
  const r = mainResult.rows[0];

  const [assignments, efforts, evidence, approvals, tasks, auditLogs] = await Promise.all([
    query(
      `SELECT a.assignedhours AS "AssignedHours", a.assigneddate AS "AssignedDate",
              a.iscurrent AS "IsCurrent", a.reassignreason AS "ReassignReason",
              s.name AS "StaffName", ab.name AS "AssignedByName"
       FROM assignment a
       JOIN staff s ON s.id = a.staffid
       JOIN staff ab ON ab.id = a.assignedby
       WHERE a.csi_wo_id = $1
       ORDER BY a.createdat DESC`,
      [id]
    ),
    query(
      `SELECT e.id AS "Id", e.logdate AS "LogDate", e.hours AS "Hours", e.notes AS "Notes",
              s.name AS "StaffName", lb.name AS "LoggedByName"
       FROM effort_log e
       JOIN staff s ON s.id = e.staffid
       LEFT JOIN staff lb ON lb.id = e.loggedby AND lb.id != e.staffid
       WHERE e.csi_wo_id = $1
       ORDER BY e.logdate DESC`,
      [id]
    ),
    query(
      `SELECT ed.id AS "Id", ed.fileref AS "FileRef", ed.evidencetype AS "EvidenceType",
              ed.caption AS "Caption", ed.uploadeddate AS "UploadedDate", s.name AS "UploadedByName"
       FROM evidence_deliverable ed
       JOIN staff s ON s.id = ed.uploadedby
       WHERE ed.csi_wo_id = $1 AND ed.removedat IS NULL
       ORDER BY ed.uploadeddate DESC`,
      [id]
    ),
    query(
      `SELECT ar.decision AS "Decision", ar.reason AS "Reason", ar.decisiondate AS "DecisionDate",
              s.name AS "ApproverName",
              ct.tiercode AS "TierCode", ct.tiername AS "TierName"
       FROM approval_record ar
       JOIN staff s ON s.id = ar.approvedby
       JOIN complexity_tier ct ON ct.id = ar.tierid
       WHERE ar.csi_wo_id = $1
       ORDER BY ar.decisiondate DESC`,
      [id]
    ),
    query(
      `SELECT wt.id AS "Id", wt.taskno AS "TaskNo", wt.description AS "Description",
              wt.assignedto AS "AssignedToId", s.name AS "AssignedToName",
              wt.progress AS "Progress", wt.scope AS "Scope", wt.status AS "Status",
              wt.datecreated AS "DateCreated", wt.datecompleted AS "DateCompleted"
       FROM wo_task wt
       LEFT JOIN staff s ON s.id = wt.assignedto
       WHERE wt.csi_wo_id = $1
       ORDER BY wt.taskno`,
      [id]
    ),
    query(
      `SELECT al.action AS "Action", al.fieldname AS "FieldName",
              al.oldvalue AS "OldValue", al.newvalue AS "NewValue",
              al.reason AS "Reason", al.performedat AS "PerformedAt",
              s.name AS "PerformedByName"
       FROM audit_log al
       JOIN staff s ON s.id = al.performedby
       WHERE al.entityname = 'CSI_WO' AND al.entityid = $1
       ORDER BY al.performedat DESC
       LIMIT 50`,
      [id]
    ),
  ]);

  const taskRows: WoTaskItem[] = tasks.rows.map((t) => ({
    id: t.Id as string,
    taskNo: Number(t.TaskNo),
    description: t.Description as string,
    assignedToId: (t.AssignedToId as string) ?? null,
    assignedToName: (t.AssignedToName as string) ?? null,
    progress: Number(t.Progress),
    scope: t.Scope as string,
    status: (t.Status as string) ?? "Active",
    dateCreated: String(t.DateCreated),
    dateCompleted: t.DateCompleted ? String(t.DateCompleted) : null,
  }));

  const activeTasks = taskRows.filter((t) => t.status === "Active");
  const progressPercent = activeTasks.length > 0
    ? Math.round(activeTasks.reduce((sum, t) => sum + t.progress, 0) / activeTasks.length)
    : 0;

  return {
    id: r.Id as string,
    csiWoNo: r.CSI_WO_No as string,
    extWoNo: (r.ExtWO_No as string) ?? null,
    sourceOfWO: (r.SourceOfWO as string) ?? null,
    requesterName: (r.RequesterName as string) ?? null,
    tenderOrProjectCode: (r.TenderOrProjectCode as string) ?? null,
    tender: r.TenderId
      ? {
          id: r.TenderId as string,
          tenderNo: r.TenderNo as string,
          tenderName: r.TenderName as string,
          status: r.TenderStatus as string,
        }
      : null,
    requestType: {
      id: r.RtId as string,
      typeCode: Number(r.TypeCode),
      typeName: r.TypeName as string,
      domain: r.Domain as string,
    },
    tier: {
      id: r.CtId as string,
      tierCode: Number(r.TierCode),
      tierName: r.TierName as string,
    },
    priorityInterdepart: r.PriorityInterdepart as string,
    priorityInternal: (r.PriorityInternal as string) ?? null,
    title: r.Title as string,
    indicativeValue: r.IndicativeValue != null ? parseFloat(String(r.IndicativeValue)) : null,
    complexityValue: r.ComplexityValue != null ? parseFloat(String(r.ComplexityValue)) : null,
    taskScore: r.TaskScore != null ? parseFloat(String(r.TaskScore)) : null,
    slaWorkingDays: r.SLAWorkingDays != null ? Number(r.SLAWorkingDays) : null,
    dueDate: r.DueDate ? String(r.DueDate) : null,
    ...computeSla(r.CreatedAt, r.SLAWorkingDays ?? r.SlaTotalDays, r.Status as string),
    status: r.Status as string,
    remark: (r.Remark as string) ?? null,
    monitoringStaff: r.MonitorId
      ? { id: r.MonitorId as string, name: r.MonitorName as string }
      : null,
    progressPercent,
    createdAt: String(r.CreatedAt),
    updatedAt: r.UpdatedAt ? String(r.UpdatedAt) : null,
    createdBy: {
      id: r.CreatorId as string,
      name: r.CreatorName as string,
      roleCode: r.CreatorRoleCode as string,
    },
    assignedTo: r.AssigneeId
      ? {
          id: r.AssigneeId as string,
          name: r.AssigneeName as string,
          roleCode: r.AssigneeRoleCode as string,
          subTeam: (r.AssigneeSubTeam as string) ?? null,
        }
      : null,
    tasks: taskRows,
    assignmentHistory: assignments.rows.map((a) => ({
      assignedTo: a.StaffName as string,
      assignedBy: a.AssignedByName as string,
      assignedHours: parseFloat(String(a.AssignedHours)),
      assignedDate: String(a.AssignedDate),
      isCurrent: a.IsCurrent as boolean,
      reassignReason: (a.ReassignReason as string) ?? null,
    })),
    effortLog: efforts.rows.map((e) => ({
      id: e.Id as string,
      staffName: e.StaffName as string,
      logDate: String(e.LogDate),
      hours: parseFloat(String(e.Hours)),
      notes: (e.Notes as string) ?? null,
      loggedByName: (e.LoggedByName as string) ?? null,
    })),
    evidenceItems: evidence.rows.map((ev) => ({
      id: ev.Id as string,
      fileRef: ev.FileRef as string,
      evidenceType: ev.EvidenceType as string,
      caption: (ev.Caption as string) ?? null,
      uploadedByName: ev.UploadedByName as string,
      uploadedDate: String(ev.UploadedDate),
    })),
    approvalTrail: approvals.rows.map((ap) => ({
      tierCode: Number(ap.TierCode),
      tierName: ap.TierName as string,
      approvedByName: ap.ApproverName as string,
      decision: ap.Decision as string,
      reason: (ap.Reason as string) ?? null,
      decisionDate: String(ap.DecisionDate),
    })),
    activityLog: auditLogs.rows.map((al) => ({
      action: al.Action as string,
      fieldName: (al.FieldName as string) ?? null,
      oldValue: (al.OldValue as string) ?? null,
      newValue: (al.NewValue as string) ?? null,
      reason: (al.Reason as string) ?? null,
      performedAt: String(al.PerformedAt),
      performedByName: al.PerformedByName as string,
    })),
  };
}

// ─── Create ─────────────────────────────────────────────────────────────────

export interface WoCreateInput {
  sourceOfWO: string;
  requesterName?: string;
  requestTypeId: string;
  tenderOrProjectCode?: string;
  title: string;
  priorityInterdepart?: string;
  priorityInternal?: string;
  slaWorkingDays?: number;
  tierId: string;
  complexityValue?: number;
  monitoringStaffId?: string;
  remark?: string;
  // External WO fields — optional for internal WOs
  extWoNo?: string;
  projectCode?: string;
  sourceDeptId?: string;
  endUser?: string;
  receivedDate?: string;
  // Optional initial assignment
  assigneeId?: string;
  assignedHours?: number;
  // Legacy
  tenderId?: string;
  indicativeValue?: number;
  dueDate?: string;
}

export interface WoCreated {
  id: string;
  csiWoNo: string;
  status: string;
  createdAt: string;
}

export async function createWorkOrder(
  input: WoCreateInput,
  session: AuthSession
): Promise<WoCreated> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Insert EXTERNAL_WO only if external WO number provided
    let extWoId: string | null = null;
    if (input.extWoNo) {
      const extResult = await client.query<{ Id: string }>(
        `INSERT INTO external_wo
          (extwo_no, projectcode, sourcedeptid, enduser, receiveddate)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id AS "Id"`,
        [
          input.extWoNo,
          input.projectCode ?? null,
          input.sourceDeptId ?? null,
          input.endUser ?? null,
          input.receivedDate ?? new Date().toISOString().slice(0, 10),
        ]
      );
      extWoId = extResult.rows[0].Id;
    }

    // 2. Generate CSI_WO_No: 300-DDMMYYYY-NNN
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const dateStr = `${dd}${mm}${yyyy}`;
    const prefix = `300-${dateStr}-`;

    const seqResult = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS "cnt" FROM csi_wo WHERE csi_wo_no LIKE $1`,
      [`${prefix}%`]
    );
    const seq = parseInt(seqResult.rows[0].cnt, 10) + 1;
    const csiWoNo = `${prefix}${String(seq).padStart(3, "0")}`;

    // 3. Insert CSI_WO with new fields
    const woResult = await client.query<{ Id: string; CreatedAt: string }>(
      `INSERT INTO csi_wo
        (csi_wo_no, extwo_id, tenderid, requesttypeid, title,
         priorityinterdepart, priorityinternal, indicativevalue,
         complexityvalue, tierid, createdby, duedate,
         sourceofwo, slaworkingdays, monitoringstaffid,
         tenderorprojectcode, remark, requestername)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id AS "Id", createdat AS "CreatedAt"`,
      [
        csiWoNo,
        extWoId,
        input.tenderId ?? null,
        input.requestTypeId,
        input.title,
        input.priorityInterdepart ?? "Normal",
        input.priorityInternal ?? null,
        input.indicativeValue ?? null,
        input.complexityValue ?? null,
        input.tierId,
        session.staffId,
        input.dueDate ?? null,
        input.sourceOfWO,
        input.slaWorkingDays ?? null,
        input.monitoringStaffId ?? null,
        input.tenderOrProjectCode ?? null,
        input.remark ?? null,
        input.requesterName ?? null,
      ]
    );
    const wo = woResult.rows[0];

    // 4. Auto-populate tasks from task_template for this request type
    const templates = await client.query<{ taskname: string; scope: string }>(
      `SELECT taskname, scope FROM task_template
       WHERE requesttypeid = $1 ORDER BY sortorder`,
      [input.requestTypeId]
    );
    for (let i = 0; i < templates.rows.length; i++) {
      const t = templates.rows[i];
      await client.query(
        `INSERT INTO wo_task (csi_wo_id, taskno, description, scope)
         VALUES ($1, $2, $3, $4)`,
        [wo.Id, i + 1, t.taskname, t.scope]
      );
    }

    // 5. Audit log
    await insertAuditEntry(
      {
        entityName: "CSI_WO",
        entityId: wo.Id,
        action: "Insert",
        newValue: JSON.stringify({ csiWoNo, title: input.title, sourceOfWO: input.sourceOfWO }),
        performedBy: session.staffId,
      },
      client
    );

    // 6. Optional initial assignment
    if (input.assigneeId && input.assignedHours) {
      const today = new Date().toISOString().slice(0, 10);
      await client.query(
        `INSERT INTO assignment (csi_wo_id, staffid, assignedhours, assigneddate, assignedby, iscurrent)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [wo.Id, input.assigneeId, input.assignedHours, today, session.staffId]
      );
      await client.query(
        `UPDATE csi_wo SET assignedto = $1, status = 'InProgress', updatedat = now() WHERE id = $2`,
        [input.assigneeId, wo.Id]
      );
      await insertAuditEntry(
        {
          entityName: "CSI_WO",
          entityId: wo.Id,
          action: "Update",
          fieldName: "AssignedTo",
          newValue: input.assigneeId,
          performedBy: session.staffId,
        },
        client
      );
    }

    await client.query("COMMIT");

    return {
      id: wo.Id,
      csiWoNo,
      status: "Open",
      createdAt: String(wo.CreatedAt),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── PATCH (FR-09) ────────────────────────────────────────────────────────────

export interface WoPatchInput {
  priority?: string;
  priorityInternal?: string | null;
  dueDate?: string | null;
  tierId?: string;
  requestTypeId?: string;
  title?: string;
  sourceOfWO?: string | null;
  requesterName?: string | null;
  remark?: string | null;
  slaWorkingDays?: number | null;
  status?: string;
  tenderOrProjectCode?: string | null;
  createdAt?: string;
  amendReason?: string;
}

export async function patchWorkOrder(
  id: string,
  input: WoPatchInput,
  session: AuthSession,
  scope: ScopeFilter
): Promise<WoDetail | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify WO exists and is within scope
    let paramIdx = 2;
    const sf = applyScopeFilter(scope, "w", paramIdx);
    const existing = await client.query(
      `SELECT w.id, w.priorityinterdepart, w.priorityinternal, w.duedate,
              w.tierid, w.requesttypeid, w.title, w.sourceofwo, w.requestername,
              w.remark, w.slaworkingdays, w.status, w.tenderorprojectcode
       FROM csi_wo w
       LEFT JOIN staff sa ON sa.id = w.assignedto
       WHERE w.id = $1 ${sf.clause}`,
      [id, ...sf.params]
    );
    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const old = existing.rows[0];

    const sets: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    const patch = (col: string, field: string, oldVal: unknown, newVal: unknown) => {
      if (newVal === undefined) return;
      if (String(newVal ?? "") === String(oldVal ?? "")) return;
      sets.push(`${col} = $${pi}`);
      params.push(newVal);
      auditField(client, id, field, oldVal != null ? String(oldVal) : null, String(newVal ?? ""), input.amendReason, session.staffId);
      pi++;
    };

    patch("priorityinterdepart", "PriorityInterdepart", old.priorityinterdepart, input.priority);
    patch("priorityinternal", "PriorityInternal", old.priorityinternal, input.priorityInternal);
    patch("duedate", "DueDate", old.duedate, input.dueDate);
    patch("tierid", "TierId", old.tierid, input.tierId);
    patch("requesttypeid", "RequestTypeId", old.requesttypeid, input.requestTypeId);
    patch("title", "Title", old.title, input.title);
    patch("sourceofwo", "SourceOfWO", old.sourceofwo, input.sourceOfWO);
    patch("requestername", "RequesterName", old.requestername, input.requesterName);
    patch("remark", "Remark", old.remark, input.remark);
    patch("slaworkingdays", "SLAWorkingDays", old.slaworkingdays, input.slaWorkingDays);
    patch("status", "Status", old.status, input.status);
    patch("tenderorprojectcode", "TenderOrProjectCode", old.tenderorprojectcode, input.tenderOrProjectCode);
    if (input.createdAt !== undefined) {
      sets.push(`createdat = $${pi}`);
      params.push(input.createdAt);
      pi++;
    }

    if (sets.length > 0) {
      sets.push(`updatedat = now()`);
      params.push(id);
      await client.query(
        `UPDATE csi_wo SET ${sets.join(", ")} WHERE id = $${pi}`,
        params
      );
    }

    await client.query("COMMIT");
    return getWorkOrderById(id, scope);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function auditField(
  client: PoolClient,
  entityId: string,
  fieldName: string,
  oldValue: string | null,
  newValue: string,
  reason: string | undefined,
  performedBy: string
) {
  await insertAuditEntry(
    {
      entityName: "CSI_WO",
      entityId,
      action: "Update",
      fieldName,
      oldValue,
      newValue,
      reason,
      performedBy,
    },
    client
  );
}

// ─── Assign (FR-10–12) ───────────────────────────────────────────────────────

export interface WoAssignResult {
  assignmentId: string;
  staffId: string;
  staffName: string;
  assignedHours: number;
  assignedDate: string;
  isCurrent: boolean;
}

export async function assignWorkOrder(
  woId: string,
  input: { staffId: string; assignedHours: number; reassignReason?: string },
  session: AuthSession,
  scope: ScopeFilter
): Promise<WoAssignResult | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify WO exists within scope
    let paramIdx = 2;
    const sf = applyScopeFilter(scope, "w", paramIdx);
    const woResult = await client.query(
      `SELECT w.id, w.status, w.assignedto
       FROM csi_wo w
       LEFT JOIN staff sa ON sa.id = w.assignedto
       WHERE w.id = $1 ${sf.clause}`,
      [woId, ...sf.params]
    );
    if (woResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const wo = woResult.rows[0];

    // Check if reassignment — if existing assignment, reason is required
    const existingAssignment = await client.query(
      `SELECT id FROM assignment WHERE csi_wo_id = $1 AND iscurrent = true`,
      [woId]
    );
    const isReassign = existingAssignment.rows.length > 0;

    if (isReassign) {
      // Deactivate current assignment
      await client.query(
        `UPDATE assignment SET iscurrent = false, updatedat = now()
         WHERE csi_wo_id = $1 AND iscurrent = true`,
        [woId]
      );
    }

    // Create new assignment
    const today = new Date().toISOString().slice(0, 10);
    const result = await client.query<{ Id: string }>(
      `INSERT INTO assignment (csi_wo_id, staffid, assignedhours, assigneddate, assignedby, iscurrent, reassignreason)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id AS "Id"`,
      [woId, input.staffId, input.assignedHours, today, session.staffId, input.reassignReason ?? null]
    );

    // Update CSI_WO.AssignedTo
    await client.query(
      `UPDATE csi_wo SET assignedto = $1, updatedat = now() WHERE id = $2`,
      [input.staffId, woId]
    );

    // If WO status is Open, transition to InProgress
    if (wo.status === "Open") {
      await client.query(
        `UPDATE csi_wo SET status = 'InProgress', updatedat = now() WHERE id = $1`,
        [woId]
      );
    }

    // Audit
    await insertAuditEntry(
      {
        entityName: "CSI_WO",
        entityId: woId,
        action: "Update",
        fieldName: "AssignedTo",
        oldValue: wo.assignedto ?? null,
        newValue: input.staffId,
        reason: input.reassignReason,
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    // Get staff name + WO details for response and notification
    const [staffResult, woDetail] = await Promise.all([
      query(`SELECT name AS "Name" FROM staff WHERE id = $1`, [input.staffId]),
      query(`SELECT csi_wo_no AS "csiWoNo", title AS "title", priorityinterdepart AS "priority", duedate AS "dueDate" FROM csi_wo WHERE id = $1`, [woId]),
    ]);

    const woInfo = woDetail.rows[0];
    if (woInfo) {
      if (isReassign) {
        notifyWoReassigned(
          input.staffId, wo.assignedto ?? null, session.staffId,
          { id: woId, csiWoNo: woInfo.csiWoNo as string, title: woInfo.title as string },
          input.reassignReason
        );
      } else {
        notifyWoAssigned(
          input.staffId, session.staffId,
          { id: woId, csiWoNo: woInfo.csiWoNo as string, title: woInfo.title as string, priority: woInfo.priority as string, dueDate: woInfo.dueDate ? String(woInfo.dueDate) : undefined },
          input.assignedHours
        );
      }
    }

    return {
      assignmentId: result.rows[0].Id,
      staffId: input.staffId,
      staffName: (staffResult.rows[0]?.Name as string) ?? "",
      assignedHours: input.assignedHours,
      assignedDate: today,
      isCurrent: true,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Complete (FR-31) ─────────────────────────────────────────────────────────

export interface WoStatusUpdate {
  id: string;
  status: string;
  approverRole?: string;
  approverName?: string | null;
}

export async function completeWorkOrder(
  woId: string,
  completionNote: string | undefined,
  session: AuthSession,
  scope: ScopeFilter
): Promise<{ result: WoStatusUpdate | null; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let paramIdx = 2;
    const sf = applyScopeFilter(scope, "w", paramIdx);
    const woResult = await client.query(
      `SELECT w.id, w.status, w.tierid,
              ct.tiercode AS "tiercode"
       FROM csi_wo w
       JOIN complexity_tier ct ON ct.id = w.tierid
       LEFT JOIN staff sa ON sa.id = w.assignedto
       WHERE w.id = $1 ${sf.clause}`,
      [woId, ...sf.params]
    );
    if (woResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: null };
    }
    const wo = woResult.rows[0];

    if (wo.status !== "Open" && wo.status !== "InProgress") {
      await client.query("ROLLBACK");
      return { result: null, error: "INVALID_STATUS_TRANSITION" };
    }

    await client.query(
      `UPDATE csi_wo SET status = 'PendingApproval', updatedat = now() WHERE id = $1`,
      [woId]
    );

    await insertAuditEntry(
      {
        entityName: "CSI_WO",
        entityId: woId,
        action: "Update",
        fieldName: "Status",
        oldValue: wo.status,
        newValue: "PendingApproval",
        reason: completionNote,
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    const tierCode = Number(wo.tiercode);
    const approverRole = tierCode === 1 ? "TeamLead" : tierCode === 2 ? "SolutionManager" : "HOD";

    // Get WO details for notification
    const woInfo = await query(
      `SELECT csi_wo_no AS "csiWoNo", title AS "title", priorityinterdepart AS "priority" FROM csi_wo WHERE id = $1`,
      [woId]
    );
    if (woInfo.rows[0]) {
      notifyWoPendingApproval(
        woId,
        { csiWoNo: woInfo.rows[0].csiWoNo as string, title: woInfo.rows[0].title as string, priority: woInfo.rows[0].priority as string },
        session.staffId,
        approverRole
      );
    }

    return {
      result: {
        id: woId,
        status: "PendingApproval",
        approverRole,
        approverName: null,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Approve / Return (FR-33) ─────────────────────────────────────────────────

export async function approveWorkOrder(
  woId: string,
  input: { decision: "Approved" | "Returned"; reason?: string },
  session: AuthSession,
  scope: ScopeFilter
): Promise<{ result: WoStatusUpdate | null; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let paramIdx = 2;
    const sf = applyScopeFilter(scope, "w", paramIdx);
    const woResult = await client.query(
      `SELECT w.id, w.status, w.tierid, w.csi_wo_no AS csiwono, w.title, w.assignedto, w.createdby
       FROM csi_wo w
       LEFT JOIN staff sa ON sa.id = w.assignedto
       WHERE w.id = $1 ${sf.clause}`,
      [woId, ...sf.params]
    );
    if (woResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: null };
    }
    const wo = woResult.rows[0];

    if (wo.status !== "PendingApproval") {
      await client.query("ROLLBACK");
      return { result: null, error: "INVALID_STATUS_TRANSITION" };
    }

    const newStatus = input.decision === "Approved" ? "Closed" : "InProgress";

    // Insert APPROVAL_RECORD
    await client.query(
      `INSERT INTO approval_record (csi_wo_id, tierid, approvedby, decision, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [woId, wo.tierid, session.staffId, input.decision, input.reason ?? null]
    );

    await client.query(
      `UPDATE csi_wo SET status = $1, updatedat = now() WHERE id = $2`,
      [newStatus, woId]
    );

    await insertAuditEntry(
      {
        entityName: "CSI_WO",
        entityId: woId,
        action: "Update",
        fieldName: "Status",
        oldValue: "PendingApproval",
        newValue: newStatus,
        reason: input.reason,
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    // Fire-and-forget notifications
    const woInfo = { csiWoNo: wo.csiwono, title: wo.title };
    if (input.decision === "Approved") {
      notifyWoApproved(woId, woInfo, session.staffId, wo.assignedto, wo.createdby);
    } else if (input.decision === "Returned") {
      notifyWoReturned(woId, woInfo, session.staffId, wo.assignedto, wo.createdby, input.reason);
    }

    return {
      result: {
        id: woId,
        status: newStatus,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── WO Tasks (checklist) ───────────────────────────────────────────────────

export async function addWoTask(
  woId: string,
  input: { description: string; assignedTo?: string; scope?: string },
  session: AuthSession
): Promise<WoTaskItem> {
  const seqResult = await query<{ maxNo: string | null }>(
    `SELECT MAX(taskno) AS "maxNo" FROM wo_task WHERE csi_wo_id = $1`,
    [woId]
  );
  const nextNo = (parseInt(seqResult.rows[0]?.maxNo ?? "0", 10) || 0) + 1;

  const result = await query<{ Id: string; DateCreated: string }>(
    `INSERT INTO wo_task (csi_wo_id, taskno, description, assignedto, scope)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id AS "Id", datecreated AS "DateCreated"`,
    [woId, nextNo, input.description, input.assignedTo ?? null, input.scope ?? "Internal"]
  );

  let assignedToName: string | null = null;
  if (input.assignedTo) {
    const staffResult = await query<{ Name: string }>(
      `SELECT name AS "Name" FROM staff WHERE id = $1`,
      [input.assignedTo]
    );
    assignedToName = (staffResult.rows[0]?.Name as string) ?? null;
  }

  return {
    id: result.rows[0].Id,
    taskNo: nextNo,
    description: input.description,
    assignedToId: input.assignedTo ?? null,
    assignedToName,
    progress: 0,
    scope: input.scope ?? "Internal",
    status: "Active",
    dateCreated: String(result.rows[0].DateCreated),
    dateCompleted: null,
  };
}

export async function updateWoTask(
  taskId: string,
  input: { description?: string; assignedTo?: string | null; progress?: number; scope?: string; status?: string }
): Promise<WoTaskItem | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let pi = 1;

  if (input.description !== undefined) {
    sets.push(`description = $${pi}`);
    params.push(input.description);
    pi++;
  }
  if (input.assignedTo !== undefined) {
    sets.push(`assignedto = $${pi}`);
    params.push(input.assignedTo);
    pi++;
  }
  if (input.progress !== undefined) {
    sets.push(`progress = $${pi}`);
    params.push(input.progress);
    pi++;
    if (input.progress === 100) {
      sets.push(`datecompleted = CURRENT_DATE`);
    } else {
      sets.push(`datecompleted = NULL`);
    }
  }
  if (input.scope !== undefined) {
    sets.push(`scope = $${pi}`);
    params.push(input.scope);
    pi++;
  }
  if (input.status !== undefined) {
    sets.push(`status = $${pi}`);
    params.push(input.status);
    pi++;
    if (input.status === "NA") {
      sets.push(`progress = 0`);
      sets.push(`datecompleted = NULL`);
    }
  }

  if (sets.length === 0) return null;

  sets.push(`updatedat = now()`);
  params.push(taskId);

  await query(
    `UPDATE wo_task SET ${sets.join(", ")} WHERE id = $${pi}`,
    params
  );

  const result = await query(
    `SELECT wt.id AS "Id", wt.taskno AS "TaskNo", wt.description AS "Description",
            wt.assignedto AS "AssignedToId", s.name AS "AssignedToName",
            wt.progress AS "Progress", wt.scope AS "Scope",
            wt.datecreated AS "DateCreated", wt.datecompleted AS "DateCompleted"
     FROM wo_task wt
     LEFT JOIN staff s ON s.id = wt.assignedto
     WHERE wt.id = $1`,
    [taskId]
  );

  if (result.rows.length === 0) return null;
  const t = result.rows[0];
  return {
    id: t.Id as string,
    taskNo: Number(t.TaskNo),
    description: t.Description as string,
    assignedToId: (t.AssignedToId as string) ?? null,
    assignedToName: (t.AssignedToName as string) ?? null,
    progress: Number(t.Progress),
    scope: t.Scope as string,
    status: (t.Status as string) ?? "Active",
    dateCreated: String(t.DateCreated),
    dateCompleted: t.DateCompleted ? String(t.DateCompleted) : null,
  };
}

export async function cancelWorkOrder(
  woId: string,
  reason: string,
  session: AuthSession,
  scope: ScopeFilter
): Promise<{ result: WoStatusUpdate | null; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let paramIdx = 2;
    const sf = applyScopeFilter(scope, "w", paramIdx);
    const woResult = await client.query(
      `SELECT w.id, w.status FROM csi_wo w WHERE w.id = $1 ${sf.clause}`,
      [woId, ...sf.params]
    );
    if (woResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: null };
    }
    const wo = woResult.rows[0];

    if (wo.status === "Closed" || wo.status === "Cancelled") {
      await client.query("ROLLBACK");
      return { result: null, error: "INVALID_STATUS_TRANSITION" };
    }

    await client.query(
      `UPDATE csi_wo SET status = 'Cancelled', updatedat = now() WHERE id = $1`,
      [woId]
    );

    await insertAuditEntry(
      {
        entityName: "CSI_WO",
        entityId: woId,
        action: "Update",
        fieldName: "Status",
        oldValue: wo.status,
        newValue: "Cancelled",
        reason,
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");
    return { result: { id: woId, status: "Cancelled" } };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteWoTask(
  taskId: string,
  session: AuthSession
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const taskRes = await client.query(
      `SELECT id, csi_wo_id AS "csiWoId", taskno AS "taskNo", description,
              assignedto AS "assignedTo", progress, scope, status
       FROM wo_task WHERE id = $1`,
      [taskId]
    );
    if (taskRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    const task = taskRes.rows[0];

    const result = await client.query(`DELETE FROM wo_task WHERE id = $1`, [taskId]);

    await insertAuditEntry(
      {
        entityName: "WO_TASK",
        entityId: taskId,
        action: "Delete",
        oldValue: JSON.stringify({
          woId: task.csiWoId,
          taskNo: task.taskNo,
          description: task.description,
          assignedTo: task.assignedTo,
          progress: task.progress,
          scope: task.scope,
          status: task.status,
        }),
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
