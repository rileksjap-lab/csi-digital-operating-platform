/**
 * CSI DOP — CSV Data Import Script
 *
 * Usage:
 *   node templates/import.mjs [--dry-run] [--file 01_STAFF.csv]
 *
 * Reads CSV templates from the /templates folder and imports into the database.
 * Requires DATABASE_URL env var or defaults to local dev connection.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");
const FILE_FILTER = (() => {
  const idx = process.argv.indexOf("--file");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://csidop_app:CHANGE_ME_VIA_SECRETS_MANAGER@localhost:5432/csidop";

function parseCsv(text) {
  const content = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const records = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "\n" && !inQuotes) {
      if (current.trim()) records.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) records.push(current);
  if (records.length < 2) return [];

  const headers = splitCsvLine(records[0]);
  const expectedCols = headers.length;
  const rows = [];
  for (let i = 1; i < records.length; i++) {
    const vals = splitCsvLine(records[i]);
    // Fix malformed CSV: if extra columns exist, merge overflow into Remark (col 14)
    if (vals.length > expectedCols && expectedCols === 21) {
      const overflow = vals.length - expectedCols;
      const remarkParts = vals.splice(14, 1 + overflow);
      vals.splice(14, 0, remarkParts.join(", "));
    }
    const row = {};
    headers.forEach((h, j) => { row[h] = (vals[j] ?? "") === "" ? null : vals[j]; });
    const hasData = Object.values(row).some((v) => v !== null);
    if (hasData) rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const vals = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === "," && !inQuotes) {
      vals.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  vals.push(current.trim());
  return vals;
}

function parseDate(val) {
  if (!val) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const m = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    let dd = parseInt(m[1]), mm = parseInt(m[2]);
    // If first part > 12 it must be day; if second > 12 swap
    if (mm > 12 && dd <= 12) { [dd, mm] = [mm, dd]; }
    return `${yr}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  return null;
}

function readTemplate(filename) {
  const path = join(__dirname, filename);
  if (!existsSync(path)) {
    console.log(`  [SKIP] ${filename} not found`);
    return [];
  }
  return parseCsv(readFileSync(path, "utf-8"));
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  console.log(`\n=== CSI DOP Data Import ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  try {
    // Pre-migration: extend title column if needed
    try { await client.query("ALTER TABLE csi_wo ALTER COLUMN title TYPE VARCHAR(500)"); console.log("  [OK] Extended title column to 500 chars"); }
    catch { console.log("  [INFO] Title column already extended or insufficient privileges — continuing"); }

    await client.query("BEGIN");

    // ── 01: Staff ──────────────────────────────────────────────────────
    if (!FILE_FILTER || FILE_FILTER.includes("01")) {
      console.log("[1/8] Importing Staff...");
      const rows = readTemplate("01_STAFF.csv");
      for (const r of rows) {
        const roleRes = await client.query("SELECT id FROM role WHERE rolecode = $1", [r.RoleCode]);
        const deptRes = await client.query("SELECT id FROM department WHERE deptcode = $1", [r.DeptCode]);
        if (roleRes.rows.length === 0) { console.log(`  [WARN] Role ${r.RoleCode} not found, skipping ${r.Name}`); continue; }
        if (deptRes.rows.length === 0) { console.log(`  [WARN] Dept ${r.DeptCode} not found, skipping ${r.Name}`); continue; }

        await client.query(
          `INSERT INTO staff (staffcode, name, email, roleid, deptid, subteam, productivityfactor, dailyusablehours, status, systemconfigflag)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (email) DO UPDATE SET
             name = EXCLUDED.name, roleid = EXCLUDED.roleid, deptid = EXCLUDED.deptid,
             subteam = EXCLUDED.subteam, productivityfactor = EXCLUDED.productivityfactor,
             dailyusablehours = EXCLUDED.dailyusablehours, status = EXCLUDED.status,
             systemconfigflag = EXCLUDED.systemconfigflag, updatedat = now()`,
          [r.StaffCode, r.Name, r.Email, roleRes.rows[0].id, deptRes.rows[0].id,
           r.SubTeam, parseFloat(r.ProductivityFactor ?? "1.0"),
           parseFloat(r.DailyUsableHours ?? "8.0"), r.Status ?? "Active",
           r.SystemConfigFlag === "true"]
        );
        console.log(`  + ${r.Name} (${r.RoleCode})`);
      }
    }

    // ── 02: Skills Assessment ──────────────────────────────────────────
    if (!FILE_FILTER || FILE_FILTER.includes("02")) {
      console.log("[2/8] Importing Skills Assessments...");
      const rows = readTemplate("02_SKILLS_ASSESSMENT.csv");
      for (const r of rows) {
        const staffRes = await client.query("SELECT id FROM staff WHERE email = $1", [r.StaffEmail]);
        if (staffRes.rows.length === 0) { console.log(`  [WARN] Staff ${r.StaffEmail} not found`); continue; }

        let skillRes = await client.query(
          "SELECT id FROM skill WHERE skillname = $1 AND technologydomain = $2",
          [r.SkillName, r.TechnologyDomain]
        );
        if (skillRes.rows.length === 0) {
          skillRes = await client.query(
            "INSERT INTO skill (skillname, technologydomain) VALUES ($1, $2) RETURNING id",
            [r.SkillName, r.TechnologyDomain]
          );
          console.log(`  [NEW SKILL] ${r.SkillName} (${r.TechnologyDomain})`);
        }

        const assessorRes = await client.query(
          "SELECT id FROM staff WHERE roleid = (SELECT id FROM role WHERE rolecode = 'HOD') LIMIT 1"
        );
        const assessedBy = assessorRes.rows[0]?.id ?? staffRes.rows[0].id;

        await client.query(
          `INSERT INTO staff_skill (staffid, skillid, competencylevel, lastassessmentdate, assessedby)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (staffid, skillid) DO UPDATE SET
             competencylevel = EXCLUDED.competencylevel,
             lastassessmentdate = EXCLUDED.lastassessmentdate,
             assessedby = EXCLUDED.assessedby`,
          [staffRes.rows[0].id, skillRes.rows[0].id, r.CompetencyLevel,
           parseDate(r.LastAssessmentDate), assessedBy]
        );
        console.log(`  + ${r.StaffEmail}: ${r.SkillName} = ${r.CompetencyLevel}`);
      }
    }

    // ── 03: Certifications ─────────────────────────────────────────────
    if (!FILE_FILTER || FILE_FILTER.includes("03")) {
      console.log("[3/8] Importing Certifications...");
      const rows = readTemplate("03_CERTIFICATIONS.csv");
      for (const r of rows) {
        const staffRes = await client.query("SELECT id FROM staff WHERE email = $1", [r.StaffEmail]);
        if (staffRes.rows.length === 0) { console.log(`  [WARN] Staff ${r.StaffEmail} not found`); continue; }

        await client.query(
          `INSERT INTO certification (staffid, certificationname, vendor, certificationlevel, issuedate, expirydate)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT DO NOTHING`,
          [staffRes.rows[0].id, r.CertificationName, r.Vendor, r.CertificationLevel,
           parseDate(r.IssueDate), parseDate(r.ExpiryDate)]
        );
        console.log(`  + ${r.StaffEmail}: ${r.CertificationName}`);
      }
    }

    // ── 04: Work Orders ────────────────────────────────────────────────
    if (!FILE_FILTER || FILE_FILTER.includes("04")) {
      console.log("[4/8] Importing Work Orders...");
      const rows = readTemplate("04_WORK_ORDERS_edited3.csv");
      for (const r of rows) {
        // Lookup request type
        const rtRes = await client.query("SELECT id FROM request_type WHERE typename = $1", [r.RequestTypeName]);
        if (rtRes.rows.length === 0) { console.log(`  [WARN] RequestType '${r.RequestTypeName}' not found, skipping`); continue; }

        // Lookup complexity tier
        const tierRes = await client.query("SELECT id FROM complexity_tier WHERE tiercode = $1", [parseInt(r.TierCode)]);
        if (tierRes.rows.length === 0) { console.log(`  [WARN] Tier ${r.TierCode} not found, skipping`); continue; }

        // Lookup monitoring staff (optional)
        let monitoringStaffId = null;
        if (r.MonitoringEmail) {
          const monRes = await client.query("SELECT id FROM staff WHERE email = $1", [r.MonitoringEmail]);
          if (monRes.rows.length > 0) monitoringStaffId = monRes.rows[0].id;
          else console.log(`  [WARN] Monitoring staff ${r.MonitoringEmail} not found`);
        }

        // Lookup assignee (optional — import without assignee if not found)
        let assigneeId = null;
        if (r.AssigneeEmail) {
          const assignRes = await client.query("SELECT id FROM staff WHERE email = $1", [r.AssigneeEmail]);
          if (assignRes.rows.length > 0) assigneeId = assignRes.rows[0].id;
          else console.log(`  [WARN] Assignee ${r.AssigneeEmail} not found, importing without assignee`);
        }

        // Lookup source department (optional, for external WOs)
        let sourceDeptId = null;
        if (r.SourceDeptCode) {
          const sdRes = await client.query("SELECT id FROM department WHERE deptcode = $1", [r.SourceDeptCode]);
          if (sdRes.rows.length > 0) sourceDeptId = sdRes.rows[0].id;
        }

        // Get creator (HOD or first staff)
        const creatorRes = await client.query(
          "SELECT id FROM staff WHERE roleid = (SELECT id FROM role WHERE rolecode = 'HOD') AND status = 'Active' LIMIT 1"
        );
        const creatorId = creatorRes.rows[0]?.id ?? assigneeId;

        // Create external WO record (only when ExtWoNo looks like a valid WO number)
        let extWoId = null;
        const extWoNo = r.ExtWoNo && /^\d{3}-/.test(r.ExtWoNo.trim()) ? r.ExtWoNo.trim() : null;
        if (extWoNo && sourceDeptId && r.ReceivedDate) {
          const extRes = await client.query(
            `INSERT INTO external_wo (extwo_no, projectcode, sourcedeptid, enduser, receiveddate)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (extwo_no) DO UPDATE SET
               projectcode = EXCLUDED.projectcode,
               sourcedeptid = EXCLUDED.sourcedeptid,
               enduser = EXCLUDED.enduser,
               receiveddate = EXCLUDED.receiveddate
             RETURNING id`,
            [extWoNo, r.ProjectCode || null, sourceDeptId,
             r.EndUser || null, parseDate(r.ReceivedDate)]
          );
          extWoId = extRes.rows[0].id;
        }

        // Generate CSI WO number: 300-DDMMYYYY-NNN
        const woSeqRes = await client.query(
          "SELECT COALESCE(MAX(CAST(SUBSTRING(csi_wo_no FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next_seq FROM csi_wo"
        );
        const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "");
        const csiWoNo = `300-${dateStr}-${String(woSeqRes.rows[0].next_seq).padStart(3, "0")}`;

        // Determine initial status (only accept valid statuses)
        const validStatuses = ["Open", "Acknowledged", "InProgress", "PendingApproval", "Approved", "Closed", "Returned", "Cancelled"];
        const status = validStatuses.includes(r.Status) ? r.Status : "Open";
        const effectiveAssignee = (status === "InProgress" && assigneeId) ? assigneeId : null;

        const indicativeVal = r.IndicativeValue ? parseFloat(r.IndicativeValue) : null;
        const complexityVal = r.ComplexityValue ? parseFloat(r.ComplexityValue) : null;

        const woRes = await client.query(
          `INSERT INTO csi_wo (
             csi_wo_no, extwo_id, requesttypeid, tierid,
             priorityinterdepart, priorityinternal, slaworkingdays,
             title, indicativevalue, complexityvalue, duedate, status,
             assignedto, createdby, monitoringstaffid,
             sourceofwo, tenderorprojectcode, remark, requestername
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           RETURNING id`,
          [csiWoNo, extWoId, rtRes.rows[0].id, tierRes.rows[0].id,
           r.PriorityInterdepart ?? "Normal", r.PriorityInternal || null,
           r.SLAWorkingDays && parseInt(r.SLAWorkingDays) > 0 ? parseInt(r.SLAWorkingDays) : null,
           (r.Title || "").substring(0, 500), indicativeVal, complexityVal,
           parseDate(r.DueDate), status,
           effectiveAssignee, creatorId, monitoringStaffId,
           r.SourceOfWO, r.TenderOrProjectCode || null, r.Remark || null,
           r.RequesterName || null]
        );

        // Create assignment if assignee is provided
        if (assigneeId) {
          await client.query(
            `INSERT INTO assignment (csi_wo_id, staffid, assignedby, assignedhours, assigneddate, iscurrent)
             VALUES ($1, $2, $3, $4, CURRENT_DATE, true)`,
            [woRes.rows[0].id, assigneeId, creatorId,
             r.AssignedHours ? parseInt(r.AssignedHours) : 40]
          );
        }

        // Auto-populate tender checklist tasks for Tender/RFP work orders
        if (r.RequestTypeName === "Tender / RFP") {
          const templates = await client.query(
            "SELECT taskno, description, defaultscope FROM tender_checklist_template WHERE isactive = true ORDER BY taskno"
          );
          for (const t of templates.rows) {
            await client.query(
              `INSERT INTO wo_task (csi_wo_id, taskno, description, scope) VALUES ($1, $2, $3, $4)
               ON CONFLICT (csi_wo_id, taskno) DO NOTHING`,
              [woRes.rows[0].id, t.taskno, t.description, t.defaultscope]
            );
          }
          console.log(`    [TASKS] Auto-populated ${templates.rows.length} tender checklist items`);
        }

        console.log(`  + ${csiWoNo}: ${r.Title} [${r.SourceOfWO}] ${status}`);
      }
    }

    // ── 05: Tenders ────────────────────────────────────────────────────
    if (!FILE_FILTER || FILE_FILTER.includes("05")) {
      console.log("[5/8] Importing Tenders...");
      const rows = readTemplate("05_TENDERS.csv");
      for (const r of rows) {
        const ownerRes = await client.query("SELECT id FROM staff WHERE email = $1", [r.OwnerEmail]);
        if (ownerRes.rows.length === 0) { console.log(`  [WARN] Owner ${r.OwnerEmail} not found`); continue; }

        const seqRes = await client.query(
          "SELECT COALESCE(MAX(CAST(SUBSTRING(tenderno FROM '[0-9]+$') AS INTEGER)), 0) + 1 AS next_seq FROM tender"
        );
        const tenderNo = `TND-${new Date().getFullYear()}-${String(seqRes.rows[0].next_seq).padStart(4, "0")}`;

        await client.query(
          `INSERT INTO tender (tenderno, tendername, client, tendercategory, closingdate,
             estimatedvalue, submittedvalue, winvalue, status, tenderownerid)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [tenderNo, r.TenderName, r.Client, r.TenderCategory, parseDate(r.ClosingDate),
           parseFloat(r.EstimatedValue), r.SubmittedValue ? parseFloat(r.SubmittedValue) : null,
           r.WinValue ? parseFloat(r.WinValue) : null, r.Status ?? "Active",
           ownerRes.rows[0].id]
        );
        console.log(`  + ${tenderNo}: ${r.TenderName}`);
      }
    }

    // ── 06: KPI Targets ────────────────────────────────────────────────
    if (!FILE_FILTER || FILE_FILTER.includes("06")) {
      console.log("[6/8] Importing KPI Records...");
      const rows = readTemplate("06_KPI_TARGETS.csv");
      for (const r of rows) {
        const staffRes = await client.query("SELECT id, roleid FROM staff WHERE email = $1", [r.StaffEmail]);
        if (staffRes.rows.length === 0) { console.log(`  [WARN] Staff ${r.StaffEmail} not found`); continue; }

        await client.query(
          `INSERT INTO kpi_record (staffid, roleid, period, metricname, targetvalue, achievedvalue)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (staffid, period, metricname) DO UPDATE SET
             targetvalue = EXCLUDED.targetvalue,
             achievedvalue = EXCLUDED.achievedvalue,
             updatedat = now()`,
          [staffRes.rows[0].id, staffRes.rows[0].roleid, r.Period,
           r.MetricName, parseFloat(r.TargetValue), parseFloat(r.AchievedValue)]
        );
        console.log(`  + ${r.StaffEmail}: ${r.MetricName} (${r.Period})`);
      }
    }

    // ── 07: OI Tracker ─────────────────────────────────────────────────
    if (!FILE_FILTER || FILE_FILTER.includes("07")) {
      console.log("[7/8] Importing OI Tracker...");
      const rows = readTemplate("07_OI_TRACKER.csv");
      for (const r of rows) {
        const staffRes = await client.query("SELECT id FROM staff WHERE email = $1", [r.StaffEmail]);
        if (staffRes.rows.length === 0) { console.log(`  [WARN] Staff ${r.StaffEmail} not found`); continue; }

        await client.query(
          `INSERT INTO oi_tracker (staffid, period, registered, won)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (staffid, period) DO UPDATE SET
             registered = EXCLUDED.registered,
             won = EXCLUDED.won,
             updatedat = now()`,
          [staffRes.rows[0].id, r.Period, parseInt(r.Registered), parseInt(r.Won)]
        );
        console.log(`  + ${r.StaffEmail}: ${r.Period} (${r.Registered} reg / ${r.Won} won)`);
      }
    }

    // ── 08: Role Split ─────────────────────────────────────────────────
    if (!FILE_FILTER || FILE_FILTER.includes("08")) {
      console.log("[8/8] Importing Role Split...");
      const rows = readTemplate("08_ROLE_SPLIT.csv");

      const byDept = {};
      for (const r of rows) {
        byDept[r.DeptCode] = (byDept[r.DeptCode] ?? 0) + parseFloat(r.Percentage);
      }
      for (const [dept, total] of Object.entries(byDept)) {
        if (Math.abs(total - 100) > 0.01) {
          console.log(`  [ERROR] ${dept} role split sums to ${total}%, must be 100%`);
          continue;
        }
      }

      for (const r of rows) {
        if (Math.abs((byDept[r.DeptCode] ?? 0) - 100) > 0.01) continue;

        const deptRes = await client.query("SELECT id FROM department WHERE deptcode = $1", [r.DeptCode]);
        const roleRes = await client.query("SELECT id FROM role WHERE rolecode = $1", [r.RoleCode]);
        if (deptRes.rows.length === 0 || roleRes.rows.length === 0) {
          console.log(`  [WARN] Dept/Role not found: ${r.DeptCode}/${r.RoleCode}`);
          continue;
        }

        await client.query(
          `INSERT INTO role_split (deptid, roleid, percentage)
           VALUES ($1, $2, $3)
           ON CONFLICT (deptid, roleid) DO UPDATE SET
             percentage = EXCLUDED.percentage,
             updatedat = now()`,
          [deptRes.rows[0].id, roleRes.rows[0].id, parseFloat(r.Percentage)]
        );
        console.log(`  + ${r.DeptCode}/${r.RoleCode}: ${r.Percentage}%`);
      }
    }

    if (DRY_RUN) {
      console.log("\n[DRY RUN] Rolling back all changes...");
      await client.query("ROLLBACK");
    } else {
      await client.query("COMMIT");
      console.log("\n=== Import complete ===\n");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n[ERROR] Import failed, rolled back:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
