import pool, { query } from "@/lib/db/pool";
import { insertAuditEntry } from "@/lib/db/audit";
import { notifyNewWoFromEwm, notifyWoCancelledByEwm, notifyWoCompletedInEwm } from "@/lib/email/notify";
import { listWorkOrders, type EwmWorkOrder } from "./client";
import {
  EWM_STATUS_MAP,
  EWM_STATUS_SKIP,
  mapEwmPriority,
  EWM_REQUEST_TYPE_MAP,
  CSIDOP_FALLBACK_REQUEST_TYPE,
} from "./mappings";

const LOOKBACK_MINUTES = 30; // 6x the recommended 5-min poll cadence

export interface EwmSyncSummary {
  imported: number;
  cancelled: number;
  completedNotified: number;
  skippedDrafts: number;
  unmappedRequestTypes: string[];
  unmappedPriorities: string[];
  errors: number;
}

function newSummary(): EwmSyncSummary {
  return {
    imported: 0,
    cancelled: 0,
    completedNotified: 0,
    skippedDrafts: 0,
    unmappedRequestTypes: [],
    unmappedPriorities: [],
    errors: 0,
  };
}

async function requestTypeIdByName(typeName: string): Promise<string | undefined> {
  const result = await query<{ id: string }>(
    `SELECT id FROM request_type WHERE typename = $1 LIMIT 1`,
    [typeName]
  );
  return result.rows[0]?.id;
}

// Mirrors createWoFromEmail() in wo-poller.ts — a dedicated raw-SQL
// transaction rather than createWorkOrder(), because this runs as a system
// job with no AuthSession (see plan's "Ground truth" section).
async function createWoFromEwm(wo: EwmWorkOrder, summary: EwmSyncSummary): Promise<void> {
  const priority = mapEwmPriority(wo.priority_inter);
  if (priority.wasUnmapped && wo.priority_inter) {
    summary.unmappedPriorities.push(wo.priority_inter);
  }

  const csidopTypeName = wo.request_type
    ? EWM_REQUEST_TYPE_MAP[wo.request_type] ?? CSIDOP_FALLBACK_REQUEST_TYPE
    : CSIDOP_FALLBACK_REQUEST_TYPE;
  if (wo.request_type && !EWM_REQUEST_TYPE_MAP[wo.request_type]) {
    summary.unmappedRequestTypes.push(wo.request_type);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const requestTypeResult = await client.query<{ id: string }>(
      `SELECT id FROM request_type WHERE typename = $1 LIMIT 1`,
      [csidopTypeName]
    );
    const requestTypeId =
      requestTypeResult.rows[0]?.id ?? (await requestTypeIdByName(CSIDOP_FALLBACK_REQUEST_TYPE));

    const tierResult = await client.query<{ id: string }>(
      `SELECT id FROM complexity_tier WHERE tiercode = 3 LIMIT 1`
    );
    const tierId = tierResult.rows[0]?.id;

    const hodResult = await client.query<{ id: string }>(
      `SELECT s.id FROM staff s JOIN role r ON r.id = s.roleid
       JOIN department d ON d.id = s.deptid
       WHERE r.rolecode = 'HOD' AND d.deptcode = 'CSI' AND s.status = 'Active'
       LIMIT 1`
    );
    const createdBy = hodResult.rows[0]?.id;

    if (!requestTypeId || !tierId || !createdBy) {
      await client.query("ROLLBACK");
      console.error("[ewm-import] Missing lookup data (requestType/tier/HOD), skipping", wo.id);
      summary.errors++;
      return;
    }

    const extResult = await client.query<{ Id: string }>(
      `INSERT INTO external_wo (extwo_no, sourcedeptid, enduser, receiveddate, ewmid)
       VALUES ($1, NULL, $2, CURRENT_DATE, $3)
       RETURNING id AS "Id"`,
      [wo.wo_number, wo.requester_name || null, wo.id]
    );
    const extWoId = extResult.rows[0].Id;

    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const prefix = `300-${dd}${mm}${yyyy}-`;
    const seqResult = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS "cnt" FROM csi_wo WHERE csi_wo_no LIKE $1`,
      [`${prefix}%`]
    );
    const seq = parseInt(seqResult.rows[0].cnt, 10) + 1;
    const csiWoNo = `${prefix}${String(seq).padStart(3, "0")}`;

    const attachmentNote = wo.task_attachments?.length
      ? `\n\n[EWM] ${wo.task_attachments.length} attachment(s) available on EWM — not yet synced to CSIDOP evidence: ${wo.task_attachments.join(", ")}`
      : "";
    const jobTypeNote = wo.job_type ? `[EWM] Job type: ${wo.job_type}` : "";
    const remark = [wo.task_description, wo.expected_result, jobTypeNote]
      .filter(Boolean)
      .join("\n\n") + attachmentNote;

    const sourceOfWO = (wo.source_of_work_order ?? "Others").slice(0, 30);

    const woResult = await client.query<{ Id: string }>(
      `INSERT INTO csi_wo
        (csi_wo_no, extwo_id, requesttypeid, title,
         priorityinterdepart, priorityinternal,
         tierid, createdby, duedate,
         sourceofwo, requestername, requesteremail, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id AS "Id"`,
      [
        csiWoNo, extWoId, requestTypeId, wo.header || `EWM WO ${wo.wo_number}`,
        priority.value, null,
        tierId, createdBy, wo.computed_due_date ? wo.computed_due_date.slice(0, 10) : null,
        sourceOfWO, wo.requester_name || null, wo.requester_email || null,
        remark || null,
      ]
    );
    const woId = woResult.rows[0].Id;

    await insertAuditEntry(
      {
        entityName: "CSI_WO",
        entityId: woId,
        action: "Insert",
        newValue: JSON.stringify({
          csiWoNo, ewmId: wo.id, extWoNo: wo.wo_number, source: "ewm-api-poller",
          title: wo.header,
        }),
        performedBy: createdBy,
      },
      client
    );

    await client.query("COMMIT");
    console.log(`[ewm-import] Created WO ${csiWoNo} from EWM id ${wo.id}`);
    summary.imported++;

    notifyNewWoFromEwm(woId, csiWoNo, wo.header, wo.wo_number, wo.requester_name ?? "");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[ewm-import] Failed to create WO from EWM id", wo.id, err);
    summary.errors++;
  } finally {
    client.release();
  }
}

// Plan Decision #2: only EWM "Cancel" mutates an existing CSIDOP WO.
// Completed/Closed fires a notification instead of auto-closing, since
// that would bypass CSI's own evidence/approval workflow.
async function applyEwmStatusChange(
  csiWoId: string,
  csiWoNo: string,
  title: string,
  currentStatus: string,
  ewmStatus: string,
  monitoringOrAssignee: string | null,
  systemStaffId: string,
  summary: EwmSyncSummary
): Promise<void> {
  const mapped = EWM_STATUS_MAP[ewmStatus];

  if (mapped === "Cancelled" && currentStatus !== "Closed" && currentStatus !== "Cancelled") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE csi_wo SET status = 'Cancelled', updatedat = now() WHERE id = $1`,
        [csiWoId]
      );
      await insertAuditEntry(
        {
          entityName: "CSI_WO",
          entityId: csiWoId,
          action: "Update",
          fieldName: "Status",
          oldValue: currentStatus,
          newValue: "Cancelled",
          reason: "Cancelled in EWM (ewm-api-poller)",
          performedBy: systemStaffId,
        },
        client
      );
      await client.query("COMMIT");
      summary.cancelled++;
      if (monitoringOrAssignee) {
        notifyWoCancelledByEwm(monitoringOrAssignee, { id: csiWoId, csiWoNo, title });
      }
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[ewm-import] Failed to apply EWM cancellation for", csiWoId, err);
      summary.errors++;
    } finally {
      client.release();
    }
    return;
  }

  if (
    (ewmStatus === "Completed" || ewmStatus === "Closed") &&
    currentStatus !== "Closed" &&
    currentStatus !== "Cancelled"
  ) {
    if (monitoringOrAssignee) {
      notifyWoCompletedInEwm(monitoringOrAssignee, { id: csiWoId, csiWoNo, title });
      summary.completedNotified++;
    }
  }
}

export async function syncFromEwm(): Promise<EwmSyncSummary> {
  const summary = newSummary();
  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);

  let wos: EwmWorkOrder[];
  try {
    wos = await listWorkOrders(since);
  } catch (err) {
    console.error("[ewm-import] Failed to fetch work orders from EWM:", err);
    summary.errors++;
    return summary;
  }

  if (wos.length === 0) return summary;

  const hodResult = await query<{ id: string }>(
    `SELECT s.id FROM staff s JOIN role r ON r.id = s.roleid
     JOIN department d ON d.id = s.deptid
     WHERE r.rolecode = 'HOD' AND d.deptcode = 'CSI' AND s.status = 'Active'
     LIMIT 1`
  );
  const systemStaffId = hodResult.rows[0]?.id;
  if (!systemStaffId) {
    console.error("[ewm-import] No active CSI HOD found — cannot process status changes");
    summary.errors++;
    return summary;
  }

  for (const wo of wos) {
    if (EWM_STATUS_SKIP.has(wo.status)) {
      summary.skippedDrafts++;
      continue;
    }
    if (wo.department_code && wo.department_code !== "CSI") {
      continue; // defensive — the API key is already department-scoped to CSI
    }

    const existing = await query<{
      csiWoId: string;
      csiWoNo: string;
      title: string;
      status: string;
      assignedTo: string | null;
      monitoringStaffId: string | null;
    }>(
      `SELECT w.id AS "csiWoId", w.csi_wo_no AS "csiWoNo", w.title, w.status,
              w.assignedto AS "assignedTo", w.monitoringstaffid AS "monitoringStaffId"
       FROM external_wo ew
       JOIN csi_wo w ON w.extwo_id = ew.id
       WHERE ew.ewmid = $1
       LIMIT 1`,
      [wo.id]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      await applyEwmStatusChange(
        row.csiWoId,
        row.csiWoNo,
        row.title,
        row.status,
        wo.status,
        row.monitoringStaffId ?? row.assignedTo,
        systemStaffId,
        summary
      );
    } else {
      await createWoFromEwm(wo, summary);
    }
  }

  return summary;
}
