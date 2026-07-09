import { ImapFlow } from "imapflow";
import { parse as parseHtml } from "node-html-parser";
import pool, { query } from "@/lib/db/pool";
import { insertAuditEntry } from "@/lib/db/audit";
import { notifyNewWoFromEmail } from "@/lib/email/notify";

const IMAP_CONFIG = {
  host: process.env.IMAP_HOST ?? "outlook.office365.com",
  port: Number(process.env.IMAP_PORT ?? 993),
  secure: true,
  auth: {
    user: process.env.IMAP_USER ?? "",
    pass: process.env.IMAP_PASS ?? "",
  },
  logger: false as const,
};

const CMT_SENDER = (process.env.CMT_SENDER_EMAIL ?? "").toLowerCase();

interface ParsedWoEmail {
  extWoNo: string;
  createdBy: string;
  sourceOfWO: string;
  toDept: string;
  ministryName: string;
  qtNo: string;
  qtTitle: string;
  closingDate: string | null;
  briefing: boolean;
  requireCSI: boolean;
  priorityInterdepart: string;
  priorityInternal: string;
  slaWorkingDays: number | null;
  woStatus: string;
  woMonitoring: string;
  remark: string;
}

const FIELD_MAP: Record<string, keyof ParsedWoEmail> = {
  "created by": "createdBy",
  "source of work order": "sourceOfWO",
  "to dept": "toDept",
  "wo number": "extWoNo",
  "ministry name": "ministryName",
  "qt no": "qtNo",
  "qt title": "qtTitle",
  "closing date": "closingDate",
  "briefing": "briefing",
  "require csi": "requireCSI",
  "level of priority (interdepart)": "priorityInterdepart",
  "level of priority (internal dept)": "priorityInternal",
  "sla": "slaWorkingDays",
  "wo status": "woStatus",
  "wo monitoring": "woMonitoring",
  "remark": "remark",
};

function parseEmailBody(html: string): ParsedWoEmail | null {
  const root = parseHtml(html);
  const rows = root.querySelectorAll("tr");

  const raw: Record<string, string> = {};
  for (const row of rows) {
    const cells = row.querySelectorAll("td");
    if (cells.length >= 2) {
      const field = cells[0].text.replace(/:$/, "").trim().toLowerCase();
      const value = cells[1].text.trim();
      if (field && FIELD_MAP[field]) {
        raw[FIELD_MAP[field]] = value;
      }
    }
  }

  if (!raw.extWoNo) return null;

  return {
    extWoNo: raw.extWoNo ?? "",
    createdBy: raw.createdBy ?? "",
    sourceOfWO: raw.sourceOfWO ?? "CMT",
    toDept: raw.toDept ?? "",
    ministryName: raw.ministryName ?? "",
    qtNo: raw.qtNo ?? "",
    qtTitle: raw.qtTitle ?? "",
    closingDate: parseDate(raw.closingDate),
    briefing: (raw.briefing ?? "").toLowerCase() === "true",
    requireCSI: (raw.requireCSI ?? "").toLowerCase() === "yes",
    priorityInterdepart: mapPriority(raw.priorityInterdepart),
    priorityInternal: mapPriority(raw.priorityInternal),
    slaWorkingDays: raw.slaWorkingDays ? parseInt(raw.slaWorkingDays, 10) || null : null,
    woStatus: raw.woStatus ?? "",
    woMonitoring: raw.woMonitoring ?? "",
    remark: raw.remark ?? "",
  };
}

function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function mapPriority(raw: string | undefined): string {
  if (!raw) return "Normal";
  const normalized = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    low: "Low", normal: "Normal", high: "High", urgent: "Urgent", critical: "Critical",
  };
  return map[normalized] ?? "Normal";
}

async function createWoFromEmail(parsed: ParsedWoEmail): Promise<string | null> {
  const exists = await query<{ cnt: string }>(
    `SELECT COUNT(*) AS "cnt" FROM external_wo WHERE extwo_no = $1`,
    [parsed.extWoNo]
  );
  if (parseInt(exists.rows[0].cnt, 10) > 0) {
    return null; // already imported
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Look up CMT department
    const deptResult = await client.query<{ id: string }>(
      `SELECT id FROM department WHERE deptcode = 'CMT' LIMIT 1`
    );
    const sourceDeptId = deptResult.rows[0]?.id ?? null;

    // Insert external WO
    const extResult = await client.query<{ Id: string }>(
      `INSERT INTO external_wo (extwo_no, projectcode, sourcedeptid, enduser, receiveddate)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)
       RETURNING id AS "Id"`,
      [parsed.extWoNo, parsed.qtNo || null, sourceDeptId, parsed.ministryName || null]
    );
    const extWoId = extResult.rows[0].Id;

    // Generate CSI_WO_No
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

    // Look up default request type for tenders
    const rtResult = await client.query<{ id: string }>(
      `SELECT id FROM request_type WHERE typename = 'Tender / RFP' LIMIT 1`
    );
    const requestTypeId = rtResult.rows[0]?.id;

    // Default complexity tier (3 = Complex for tenders)
    const tierResult = await client.query<{ id: string }>(
      `SELECT id FROM complexity_tier WHERE tiercode = 3 LIMIT 1`
    );
    const tierId = tierResult.rows[0]?.id;

    // System account for automated imports (HOD CSI)
    const hodResult = await client.query<{ id: string }>(
      `SELECT s.id FROM staff s JOIN role r ON r.id = s.roleid
       JOIN department d ON d.id = s.deptid
       WHERE r.rolecode = 'HOD' AND d.deptcode = 'CSI' AND s.status = 'Active'
       LIMIT 1`
    );
    const createdBy = hodResult.rows[0]?.id;

    if (!requestTypeId || !tierId || !createdBy) {
      await client.query("ROLLBACK");
      console.error("[wo-poller] Missing lookup data (requestType/tier/HOD)");
      return null;
    }

    const title = parsed.qtTitle || `Tender ${parsed.extWoNo}`;

    const woResult = await client.query<{ Id: string }>(
      `INSERT INTO csi_wo
        (csi_wo_no, extwo_id, requesttypeid, title,
         priorityinterdepart, priorityinternal,
         tierid, createdby, duedate,
         sourceofwo, slaworkingdays,
         tenderorprojectcode, requestername, remark)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id AS "Id"`,
      [
        csiWoNo, extWoId, requestTypeId, title,
        parsed.priorityInterdepart, parsed.priorityInternal,
        tierId, createdBy, parsed.closingDate,
        "CMT", parsed.slaWorkingDays,
        parsed.qtNo || null, parsed.createdBy || null,
        parsed.remark || null,
      ]
    );
    const woId = woResult.rows[0].Id;

    await insertAuditEntry(
      {
        entityName: "CSI_WO",
        entityId: woId,
        action: "Insert",
        newValue: JSON.stringify({
          csiWoNo, extWoNo: parsed.extWoNo, source: "email-poller",
          title, ministry: parsed.ministryName,
        }),
        performedBy: createdBy,
      },
      client
    );

    await client.query("COMMIT");
    console.log(`[wo-poller] Created WO ${csiWoNo} from email ${parsed.extWoNo}`);

    notifyNewWoFromEmail(woId, csiWoNo, title, parsed.extWoNo, parsed.ministryName);

    return csiWoNo;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function pollForWoEmails(): Promise<number> {
  if (!IMAP_CONFIG.auth.user || !CMT_SENDER) {
    console.log("[wo-poller] IMAP credentials or CMT_SENDER_EMAIL not configured, skipping");
    return 0;
  }

  const client = new ImapFlow(IMAP_CONFIG);
  let created = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search for unseen emails from the CMT sender
      const messages = client.fetch(
        { seen: false, from: CMT_SENDER },
        { source: true, envelope: true, uid: true }
      );

      for await (const msg of messages) {
        try {
          const source = msg.source?.toString("utf-8") ?? "";

          // Extract HTML body from raw source
          const htmlMatch = source.match(/<html[\s\S]*?<\/html>/i)
            ?? source.match(/<table[\s\S]*?<\/table>/i);

          if (!htmlMatch) {
            console.log(`[wo-poller] No HTML table in email UID ${msg.uid}, skipping`);
            continue;
          }

          const parsed = parseEmailBody(htmlMatch[0]);
          if (!parsed) {
            console.log(`[wo-poller] Could not parse WO fields from email UID ${msg.uid}`);
            continue;
          }

          if (!parsed.requireCSI) {
            console.log(`[wo-poller] Email UID ${msg.uid} does not require CSI, skipping`);
            // Mark as seen so we don't re-process
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
            continue;
          }

          const woNo = await createWoFromEmail(parsed);
          if (woNo) {
            created++;
            // Mark as seen after successful import
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
          } else {
            // Already imported or failed — mark seen to avoid retrying
            await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
          }
        } catch (err) {
          console.error(`[wo-poller] Error processing email UID ${msg.uid}:`, err);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error("[wo-poller] IMAP connection error:", err);
  }

  if (created > 0) {
    console.log(`[wo-poller] Imported ${created} new WO(s) from email`);
  }
  return created;
}
