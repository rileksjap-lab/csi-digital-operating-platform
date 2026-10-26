import pool, { query } from "@/lib/db/pool";
import { insertAuditEntry } from "@/lib/db/audit";
import type { AuthSession } from "@/lib/types/api";
import { STATUS_LABEL, type AppraisalStatus } from "@/lib/kpi/workflow";
import { sendHrReportEmail } from "@/lib/email/hr-report";
import { appraisalFileName, buildAppraisalPdf, buildSummaryCsv, type SummaryRow } from "@/lib/kpi/hr-files";
import { getAppraisalForReport, type Fail, type Result } from "@/lib/repositories/kpi-appraisal.repo";

// The HR report: who is ready, who is not, and the one action that emails the
// final results to HR. Only the HOD and the SVP use this; the sender never
// sends their own appraisal (the SVP sends the HOD's).

const fail = (status: Fail["status"], message: string, problems?: string[]): Fail => ({ ok: false, status, message, problems });

interface Row {
  id: string; staffId: string; name: string; roleName: string; subTeam: string | null;
  reviewerName: string; finalApproverName: string; status: AppraisalStatus;
  kra: number | null; value: number | null; bonus: number | null; total: number | null;
  outcome: string | null; finalisedAt: string | null; sentToHrAt: string | null;
}

async function loadRows(cycleId: string, session: AuthSession): Promise<Row[]> {
  const res = await query<Row>(
    `SELECT a.id, a.staffid AS "staffId", s.name, t.displayname AS "roleName", s.subteam AS "subTeam",
            rv.name AS "reviewerName", fa.name AS "finalApproverName", a.status,
            a.krapoints::float AS kra, a.valuepoints::float AS value, a.bonuspoints::float AS bonus,
            a.totalpoints::float AS total, a.outcome, a.finalisedat AS "finalisedAt", a.senttohrat AS "sentToHrAt"
     FROM kpi_appraisal a
     JOIN staff s ON s.id = a.staffid JOIN staff rv ON rv.id = a.reviewerid JOIN staff fa ON fa.id = a.finalapproverid
     JOIN kpi_template t ON t.id = a.templateid
     WHERE a.cycleid = $1 AND ($2 = 'SVP' OR s.deptid = $3)
     ORDER BY s.name`,
    [cycleId, session.role, session.departmentId]
  );
  return res.rows;
}

export async function getHrReport(cycleId: string, session: AuthSession): Promise<Result<unknown>> {
  if (session.role !== "HOD" && session.role !== "SVP") return fail(403, "Only the HOD and the SVP can open the HR report");
  const cycleRes = await query<{ id: string; name: string; status: string; config: { hrEmails?: string[] } }>(
    `SELECT id, name, status, config FROM kpi_cycle WHERE id = $1`, [cycleId]);
  const cycle = cycleRes.rows[0];
  if (!cycle) return fail(404, "KPI cycle not found");

  const rows = await loadRows(cycleId, session);
  const recipients = cycle.config.hrEmails ?? [];
  // The sender cannot send their own appraisal, so it is not part of their batch.
  const batch = rows.filter((r) => r.staffId !== session.staffId);
  const ready = batch.filter((r) => r.status === "Finalised" || r.status === "SentToHR");
  const pending = batch.filter((r) => r.status === "Finalised");
  const blockers = batch.filter((r) => r.status !== "Finalised" && r.status !== "SentToHR").map((r) => `${r.name}: ${STATUS_LABEL[r.status]}`);

  const history = await query(
    `SELECT h.sentat AS "sentAt", s.name AS "sentBy", h.recipients, cardinality(h.appraisalids) AS count, h.status, h.error
     FROM kpi_hr_send h JOIN staff s ON s.id = h.sentby
     WHERE h.cycleid = $1 ORDER BY h.sentat DESC LIMIT 10`, [cycleId]);

  let cannotSend: string | null = null;
  if (recipients.length === 0) cannotSend = "No HR email address is set. Add one in KPI Setup, under Cycle & certifications.";
  else if (batch.length === 0) cannotSend = "There are no appraisals to send yet.";
  else if (blockers.length > 0) cannotSend = `${blockers.length} appraisal${blockers.length === 1 ? " is" : "s are"} not finalised yet.`;

  return {
    ok: true,
    value: {
      cycle: { id: cycle.id, name: cycle.name, status: cycle.status },
      recipients,
      subject: subjectFor(cycle.name, ready.length),
      attachments: [`KPI_summary.csv`, ...ready.map((r) => `KPI_${r.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}.pdf`)],
      rows: rows.map((r) => ({ ...r, ownAppraisal: r.staffId === session.staffId })),
      counts: { total: rows.length, ready: ready.length, pending: pending.length, sent: ready.length - pending.length },
      blockers, cannotSend,
      canSend: cannotSend === null,
      history: history.rows,
    },
  };
}

const subjectFor = (cycleName: string, n: number) => `${cycleName}: final KPI appraisal results (${n} staff)`;

export async function buildSummaryFile(cycleId: string, session: AuthSession): Promise<Result<{ csv: Buffer }>> {
  if (session.role !== "HOD" && session.role !== "SVP") return fail(403, "Only the HOD and the SVP can open the HR report");
  const rows = await loadRows(cycleId, session);
  return { ok: true, value: { csv: buildSummaryCsv(rows.map(toSummary)) } };
}

const toSummary = (r: Row): SummaryRow => ({
  name: r.name, roleName: r.roleName, subTeam: r.subTeam, reviewerName: r.reviewerName, finalApproverName: r.finalApproverName,
  status: STATUS_LABEL[r.status], kra: r.kra, value: r.value, bonus: r.bonus, total: r.total, outcome: r.outcome, finalisedAt: r.finalisedAt,
});

export async function sendToHr(cycleId: string, session: AuthSession, opts: { resend: boolean }): Promise<Result<{ sent: number; newlySent: number; simulated: boolean; recipients: string[] }>> {
  const report = await getHrReport(cycleId, session);
  if (!report.ok) return report;
  const r = report.value as {
    cycle: { name: string }; recipients: string[]; subject: string; canSend: boolean; cannotSend: string | null; blockers: string[];
    rows: (Row & { ownAppraisal: boolean })[]; counts: { pending: number };
  };
  if (!r.canSend) return fail(409, r.cannotSend ?? "Cannot send yet", r.blockers);
  if (r.counts.pending === 0 && !opts.resend) return fail(409, "Everything in this cycle has already been sent to HR. Use resend if HR needs the files again.");

  const batch = r.rows.filter((x) => !x.ownAppraisal && (x.status === "Finalised" || x.status === "SentToHR"));
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [
    { filename: "KPI_summary.csv", content: buildSummaryCsv(r.rows.map(toSummary)), contentType: "text/csv; charset=utf-8" },
  ];
  for (const row of batch) {
    const detail = await getAppraisalForReport(row.id);
    if (!detail) return fail(404, `Appraisal for ${row.name} could not be loaded`);
    attachments.push({ filename: appraisalFileName(detail), content: await buildAppraisalPdf(detail), contentType: "application/pdf" });
  }

  const sender = await query<{ name: string }>(`SELECT name FROM staff WHERE id = $1`, [session.staffId]);
  const text = [
    `Final KPI appraisal results for ${r.cycle.name} are attached.`,
    "",
    `Staff included: ${batch.length}`,
    "Attached: KPI_summary.csv (one line per person) and one PDF form per person.",
    "",
    `Sent by ${sender.rows[0]?.name ?? "CSI"} from the CSI Digital Operating Platform.`,
    "This email and its attachments are private and confidential.",
  ].join("\n");

  const logBase = [cycleId, session.staffId, r.recipients, r.subject, batch.map((b) => b.id), attachments.map((a) => a.filename)];
  let simulated = false;
  try {
    simulated = (await sendHrReportEmail({ to: r.recipients, subject: r.subject, text, attachments })).simulated;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown mail error";
    console.error("[kpi/hr-report] email failed", err);
    await query(
      `INSERT INTO kpi_hr_send (cycleid, sentby, recipients, subject, appraisalids, attachments, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, 'Failed', $7)`, [...logBase, message.slice(0, 500)]);
    return fail(502, "The email could not be sent, so nothing was marked as sent. Please try again or check the mail settings.");
  }

  // Only now that the email has gone out do the appraisals count as sent.
  const client = await pool.connect();
  let newly = 0;
  try {
    await client.query("BEGIN");
    for (const row of batch.filter((b) => b.status === "Finalised")) {
      const upd = await client.query(
        `UPDATE kpi_appraisal SET status = 'SentToHR', senttohrat = now(), senttohrby = $2, updatedat = now()
         WHERE id = $1 AND status = 'Finalised' RETURNING id`, [row.id, session.staffId]);
      if (upd.rows.length === 0) continue;
      newly++;
      await insertAuditEntry(
        { entityName: "KPI_APPRAISAL", entityId: row.id, action: "StatusChange", fieldName: "Status", oldValue: "Finalised", newValue: "SentToHR",
          reason: `Emailed to ${r.recipients.join(", ")}`, performedBy: session.staffId },
        client
      );
    }
    await client.query(
      `INSERT INTO kpi_hr_send (cycleid, sentby, recipients, subject, appraisalids, attachments, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`, [...logBase, simulated ? "Simulated" : "Sent"]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { ok: true, value: { sent: batch.length, newlySent: newly, simulated, recipients: r.recipients } };
}
