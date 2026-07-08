import type { NextRequest } from "next/server";
import { ok, badRequest, internalError } from "@/lib/response";
import { query } from "@/lib/db/pool";
import { computeSla } from "@/lib/repositories/wo.repo";
import { createNotification } from "@/lib/repositories/notification.repo";
import { notifyWoSlaBreach, notifyWoSlaWarning } from "@/lib/email/notify";

interface SlaCheckRow {
  Id: string;
  CsiWoNo: string;
  Title: string;
  Priority: string;
  DueDate: string | null;
  CreatedAt: string;
  UpdatedAt: string | null;
  AssignedTo: string | null;
  MonitoringStaffId: string | null;
  CreatedBy: string;
  Status: string;
  SLAWorkingDays: number | null;
  SlaTotalDays: number | null;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return badRequest("Unauthorized");
    }

    const rows = await query<SlaCheckRow>(
      `SELECT
        w.id AS "Id", w.csi_wo_no AS "CsiWoNo", w.title AS "Title",
        w.priorityinterdepart AS "Priority", w.duedate AS "DueDate",
        w.createdat AS "CreatedAt", w.updatedat AS "UpdatedAt",
        w.assignedto AS "AssignedTo", w.monitoringstaffid AS "MonitoringStaffId",
        w.createdby AS "CreatedBy", w.status AS "Status",
        w.slaworkingdays AS "SLAWorkingDays",
        (rt.slaackdays + rt.slaclassifydays + rt.slaroutedays) AS "SlaTotalDays"
      FROM csi_wo w
      JOIN request_type rt ON rt.id = w.requesttypeid
      WHERE w.status NOT IN ('Closed', 'Cancelled')`
    );

    let warningsSent = 0;
    let breachesSent = 0;

    for (const row of rows.rows) {
      const slaDays = row.SLAWorkingDays ?? row.SlaTotalDays;
      const { slaStatus } = computeSla(row.CreatedAt, slaDays, row.Status);
      if (slaStatus !== "Warning" && slaStatus !== "Breached") continue;

      const category = `SLA_${slaStatus}`;
      const linkUrl = `/wo/${row.Id}`;
      const since = row.UpdatedAt ?? row.CreatedAt;

      const existing = await query<{ exists: boolean }>(
        `SELECT EXISTS(
          SELECT 1 FROM notification
          WHERE category = $1 AND linkurl = $2 AND createdat >= $3
        ) AS "exists"`,
        [category, linkUrl, since]
      );
      if (existing.rows[0]?.exists) continue;

      const recipients = new Set<string>();
      recipients.add(row.AssignedTo ?? row.CreatedBy);
      if (row.MonitoringStaffId) recipients.add(row.MonitoringStaffId);

      const wo = {
        id: row.Id,
        csiWoNo: row.CsiWoNo,
        title: row.Title,
        priority: row.Priority,
        dueDate: row.DueDate ?? undefined,
      };

      for (const staffId of recipients) {
        createNotification({
          staffId,
          title: `SLA ${slaStatus}: ${row.CsiWoNo}`,
          body: row.Title,
          category,
          linkUrl,
        }).catch((e) => console.error("[sla-check] notification create failed", e));

        if (slaStatus === "Warning") notifyWoSlaWarning(staffId, wo);
        else notifyWoSlaBreach(staffId, wo);
      }

      if (slaStatus === "Warning") warningsSent++;
      else breachesSent++;
    }

    return ok({ checked: rows.rows.length, warningsSent, breachesSent });
  } catch (err) {
    console.error("[sla-check] POST error", err);
    return internalError(request.headers.get("x-request-id") ?? "unknown");
  }
}
