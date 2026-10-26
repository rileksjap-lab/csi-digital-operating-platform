import PDFDocument from "pdfkit";
import type { AppraisalDetail } from "@/lib/repositories/kpi-appraisal.repo";
import { ratingAt, STATUS_LABEL } from "@/lib/kpi/workflow";
import { certificateScore } from "@/lib/kpi/scoring";

// Files that go to HR: a printable appraisal form per person (PDF) and a
// one-line-per-person summary (CSV, opens in Excel). Built from the same data
// the form shows, so HR sees exactly what was agreed.

const GREY = "#6b7280";
const DARK = "#111827";

/** Characters pdfkit's built-in font cannot draw become plain equivalents. */
const plain = (s: string | null | undefined) =>
  (s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[^\x20-\x7E\n]/g, "");

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export function appraisalFileName(d: AppraisalDetail): string {
  const safe = d.staff.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `KPI_${safe}.pdf`;
}

export function buildAppraisalPdf(d: AppraisalDetail, cycleName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const need = (h: number) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
    const heading = (t: string) => { need(40); doc.moveDown(0.8).font("Helvetica-Bold").fontSize(11).fillColor(DARK).text(t, left, doc.y, { width }); doc.moveDown(0.3); };
    const small = (t: string, color = GREY) => doc.font("Helvetica").fontSize(8).fillColor(color).text(plain(t), left, doc.y, { width });

    // Header
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GREY).text("10 Creative Solutions Sdn Bhd (Private & Confidential)", left, doc.y, { width });
    doc.font("Helvetica-Bold").fontSize(15).fillColor(DARK).text(`KPI Appraisal - ${plain(cycleName)}`, left, doc.y + 2, { width });
    doc.moveDown(0.4).font("Helvetica").fontSize(10).fillColor(DARK);
    doc.text(`Name: ${plain(d.staff.name)}`, left, doc.y, { width });
    doc.text(`Designation: ${plain(d.staff.roleName)}${d.staff.subTeam ? `   Pod: ${d.staff.subTeam}` : ""}`, left, doc.y, { width });
    doc.text(`Reviewer: ${plain(d.reviewer.name)}   Final approver: ${plain(d.finalApprover.name)}`, left, doc.y, { width });
    doc.text(`Status: ${STATUS_LABEL[d.status]}   Finalised: ${fmtDate(d.submittedAt.finalised)}`, left, doc.y, { width });

    // Summary
    const t = d.totals;
    heading("Summary");
    const rows = [
      ["KRA - Departmental", "60", String(t.kra)],
      ["Individual Assessment - Human Resources", "40", String(t.value)],
      ["Extra Assessment (bonus)", "20", String(t.bonus)],
      ["TOTAL", "120", String(t.total)],
    ];
    for (const [label, max, got] of rows) {
      need(16);
      const y = doc.y;
      const bold = label === "TOTAL";
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).fillColor(DARK);
      doc.text(label, left, y, { width: width - 140 });
      doc.text(`${got} / ${max}`, left + width - 120, y, { width: 120, align: "right" });
    }
    if (d.snapshot?.outcome ?? t.outcome) small(`Outcome: ${d.snapshot?.outcome ?? t.outcome}`, DARK);

    // Section 4: KRA lines
    heading("Section 4: KRA assessment (departmental, 60%)");
    const byLine = new Map(d.scores.filter((s) => s.lineId).map((s) => [s.lineId as string, s]));
    for (const l of d.lines) {
      const s = byLine.get(l.id);
      need(70);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text(`${l.lineNo}. ${plain(l.name)}  (${l.weight}%)`, left, doc.y, { width });
      if (l.target) small(`Target: ${l.target}`);
      doc.font("Helvetica").fontSize(9).fillColor(DARK).text(
        `Self: ${s?.selfRating ?? "-"}    Superior: ${s?.reviewerRating ?? "-"}    Final: ${s ? (ratingAt(s, "final") ?? "-") : "-"}`, left, doc.y, { width });
      if (s?.selfEvidence) small(`Evidence: ${s.selfEvidence}`);
      if (s?.reviewerEvidence) small(`Superior evidence: ${s.reviewerEvidence}`);
      if (s?.selfComment) small(`Employee remarks: ${s.selfComment}`);
      if (s?.reviewerComment) small(`Superior remarks: ${s.reviewerComment}`);
      if (s?.finalComment) small(`Final remarks: ${s.finalComment}`);
      doc.moveDown(0.4);
    }

    // Sections 1 and 2: HR items and bonus items
    const byItem = new Map(d.scores.filter((s) => s.itemId).map((s) => [s.itemId as string, s]));
    const certScore = d.certConfig ? certificateScore(d.certs, d.certConfig).score : 0;
    for (const [title, section] of [["Section 1: Individual evaluation (HR, 40%)", "Value"], ["Section 2: Bonus marks (20%)", "Bonus"]] as const) {
      heading(title);
      for (const i of d.items.filter((x) => x.section === section)) {
        const s = byItem.get(i.id);
        need(34);
        doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text(`${i.itemNo}. ${plain(i.name)}  (${i.weight}%)`, left, doc.y, { width });
        if (i.inputMode === "Certificates") {
          doc.font("Helvetica").fontSize(9).text(`Score: ${certScore} / ${i.scaleMax}`, left, doc.y, { width });
          for (const c of d.certs) small(`${c.name}${c.yearLabel ? ` (${c.yearLabel})` : ""} - ${c.category}`);
        } else {
          doc.font("Helvetica").fontSize(9).fillColor(DARK).text(
            `Self: ${s?.selfRating ?? "-"}    Superior: ${s?.reviewerRating ?? "-"}    Final: ${s ? (ratingAt(s, "final") ?? "-") : "-"}   (out of ${i.scaleMax})`, left, doc.y, { width });
          if (s?.selfComment) small(`Employee remarks: ${s.selfComment}`);
          if (s?.reviewerComment) small(`Superior remarks: ${s.reviewerComment}`);
          if (s?.finalComment) small(`Final remarks: ${s.finalComment}`);
        }
        doc.moveDown(0.3);
      }
    }

    // 1:1
    heading("1:1 meeting with the immediate superior");
    if (d.oneOnOne) {
      doc.font("Helvetica").fontSize(9).fillColor(DARK).text(`Date: ${d.oneOnOne.meetingDate}`, left, doc.y, { width });
      if (d.oneOnOne.notes) small(`Notes: ${d.oneOnOne.notes}`);
      if (d.oneOnOne.agreedActions) small(`Agreed actions: ${d.oneOnOne.agreedActions}`);
      small(d.oneOnOne.employeeAckAt ? `Confirmed by ${d.staff.name} on ${fmtDate(d.oneOnOne.employeeAckAt)}` : `Not confirmed by ${d.staff.name}`);
    } else {
      small("Not recorded.");
    }

    // Sign-off block, as on the paper form
    heading("Sign-off");
    const sign = (label: string, name: string | null, date: string) => {
      need(40);
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text(label, left, y, { width: 150 });
      doc.font("Helvetica").fontSize(9).text(name ? plain(name) : "_______________________", left + 150, y, { width: 220 });
      doc.text(`Date: ${date || "____________"}`, left + 380, y, { width: 140 });
      doc.moveDown(0.6);
    };
    sign("Employee", d.staff.name, fmtDate(d.submittedAt.self));
    sign("Reviewer", d.reviewer.name, fmtDate(d.submittedAt.review));
    sign("HOD / Final approver", d.finalApprover.name, fmtDate(d.submittedAt.finalised));
    sign("SVP - Operations", d.svpOps.name, d.svpOps.date ?? "");
    sign("Received by Human Resources", null, "");

    doc.end();
  });
}

// ── Summary spreadsheet ─────────────────────────────────────────────────────

export interface SummaryRow {
  name: string; roleName: string; subTeam: string | null; reviewerName: string; finalApproverName: string;
  status: string; kra: number | null; value: number | null; bonus: number | null; total: number | null;
  outcome: string | null; finalisedAt: string | null;
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV with a byte-order mark so Excel opens the characters correctly. */
export function buildSummaryCsv(rows: SummaryRow[]): Buffer {
  const head = ["Name", "Designation", "Pod", "Reviewer", "Final approver", "Status", "KRA (60)", "HR items (40)", "Bonus (20)", "Total (120)", "Outcome", "Finalised on"];
  const lines = rows.map((r) => [r.name, r.roleName, r.subTeam, r.reviewerName, r.finalApproverName, r.status, r.kra, r.value, r.bonus, r.total, r.outcome, r.finalisedAt ? fmtDate(r.finalisedAt) : ""].map(csvCell).join(","));
  return Buffer.from("﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n", "utf8");
}
