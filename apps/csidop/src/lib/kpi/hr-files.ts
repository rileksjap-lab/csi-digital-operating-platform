import PDFDocument from "pdfkit";
import type { AppraisalDetail } from "@/lib/repositories/kpi-appraisal.repo";
import { ratingAt } from "@/lib/kpi/workflow";
import { certificateScore, outcomeFor } from "@/lib/kpi/scoring";

// Files that go to HR: the appraisal form per person (PDF, laid out like the
// paper form: summary, Section 1 HR items, Section 2 bonus, Section 3 outcome
// and sign-off, Section 4 KRA, Section 4A rating definitions) and a
// one-line-per-person summary (CSV, opens in Excel). Everything printed comes
// from the same data the screen shows; the fixed wording of the form lives in
// the cycle settings.

const L = 40;
const W = 515;
const GREY = "#6b7280";
const DARK = "#111827";
const LINE = "#9ca3af";
const SHADE = "#e5e7eb";

/** Characters pdfkit's built-in font cannot draw become plain equivalents. */
const plain = (s: string | null | undefined) =>
  (s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[^\x20-\x7E\n]/g, "");

const dateLong = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
const dateIso = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const startOf = (key: string) => Number((key.match(/^\d+/) ?? ["0"])[0]);
const inBand = (key: string, score: number | null) => {
  if (score === null) return false;
  const m = key.match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? score >= Number(m[1]) && score <= Number(m[2]) : Number(key) === score;
};

export function appraisalFileName(d: AppraisalDetail): string {
  const safe = d.staff.name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `KPI_${safe}.pdf`;
}

interface Cell { w: number; text: string; bold?: boolean; align?: "left" | "center" | "right"; fill?: string; color?: string }

export function buildAppraisalPdf(d: AppraisalDetail): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageEnd = () => doc.page.height - doc.page.margins.bottom;
    const need = (h: number) => { if (doc.y + h > pageEnd()) { doc.addPage(); doc.y = doc.page.margins.top; } };
    const gap = (h = 8) => { doc.y += h; };
    const text = (t: string, o: { size?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right"; width?: number; x?: number } = {}) => {
      doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 9).fillColor(o.color ?? DARK);
      doc.text(plain(t), o.x ?? L, doc.y, { width: o.width ?? W, align: o.align ?? "left" });
    };
    const heading = (t: string) => { need(40); gap(6); text(t, { size: 12, bold: true }); gap(4); };

    /** One bordered table row; the row grows to fit its tallest cell. */
    const row = (cells: Cell[], o: { size?: number; header?: boolean } = {}) => {
      const size = o.size ?? 8;
      const pad = 3;
      const heights = cells.map((c) => {
        doc.font(c.bold || o.header ? "Helvetica-Bold" : "Helvetica").fontSize(size);
        return doc.heightOfString(plain(c.text) || " ", { width: c.w - pad * 2 }) + pad * 2;
      });
      const h = Math.max(...heights, 14);
      need(h);
      const y = doc.y;
      let x = L;
      for (const c of cells) {
        const fill = c.fill ?? (o.header ? SHADE : undefined);
        if (fill) doc.save().rect(x, y, c.w, h).fill(fill).restore();
        doc.lineWidth(0.5).strokeColor(LINE).rect(x, y, c.w, h).stroke();
        doc.font(c.bold || o.header ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(c.color ?? DARK);
        doc.text(plain(c.text), x + pad, y + pad, { width: c.w - pad * 2, align: c.align ?? "left" });
        x += c.w;
      }
      doc.y = y + h;
    };

    /** The 1..max score strip with the chosen score filled in. */
    const scaleStrip = (max: number, chosen: number | null) => {
      need(22);
      const y = doc.y;
      const cw = Math.min(26, (W - 40) / max);
      for (let n = 1; n <= max; n++) {
        const x = L + (n - 1) * cw;
        const on = chosen === n;
        if (on) doc.save().rect(x, y, cw, 16).fill(DARK).restore();
        doc.lineWidth(0.5).strokeColor(LINE).rect(x, y, cw, 16).stroke();
        doc.font(on ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(on ? "#ffffff" : DARK).text(String(n), x, y + 4, { width: cw, align: "center" });
      }
      doc.y = y + 16;
      doc.font("Helvetica").fontSize(9).fillColor(DARK).text(chosen === null ? "Score: not given" : `Score: ${chosen} / ${max}`, L + max * cw + 8, y + 4, { width: 120, lineBreak: false });
      doc.y = y + 20;
    };

    /** Height of wrapped text, so a block can be kept together on one page. */
    const hOf = (t: string, width: number, size: number, bold = false) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      return doc.heightOfString(plain(t) || " ", { width });
    };

    // ── Data used throughout ────────────────────────────────────────────────
    const byLine = new Map(d.scores.filter((s) => s.lineId).map((s) => [s.lineId as string, s]));
    const byItem = new Map(d.scores.filter((s) => s.itemId).map((s) => [s.itemId as string, s]));
    const cert = d.certConfig ? certificateScore(d.certs, d.certConfig) : { totalPoints: 0, qualified: false, score: 0 };
    const finalOf = (s?: (typeof d.scores)[number]) => (s ? ratingAt(s, "final") : null);
    const itemScore = (i: (typeof d.items)[number]) => (i.inputMode === "Certificates" ? cert.score : finalOf(byItem.get(i.id)));
    const contrib = (i: (typeof d.items)[number]) => { const sc = itemScore(i); return sc === null ? 0 : i.weight * (sc / i.scaleMax); };
    const value = d.items.filter((i) => i.section === "Value");
    const bonus = d.items.filter((i) => i.section === "Bonus");
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const valuePct = sum(value.map(contrib));
    const bonusPct = sum(bonus.map(contrib));
    const total = d.totals.total;
    const outcome = d.snapshot?.outcome ?? outcomeFor(total, d.outcomeBands);
    const year = (d.cycle.periodStart ?? "").slice(0, 4);
    const title = `10CS KPI ${year} - ${plain(d.staff.roleName)}`;
    const appraisalMonth = d.cycle.periodEnd
      ? new Date(d.cycle.periodEnd).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).toUpperCase() : "";

    // ── Page 1: header, summary overview, final weightage ───────────────────
    text("10 Creative Solutions Sdn Bhd (Private & Confidential)", { size: 8, color: GREY });
    gap(2);
    text(title, { size: 16, bold: true });
    gap(8);
    const kv = (k: string, v: string) => { doc.font("Helvetica-Bold").fontSize(9).fillColor(DARK).text(`${k}: `, L, doc.y, { continued: true }).font("Helvetica").text(plain(v)); };
    kv("NAME", d.staff.name.toUpperCase());
    kv("DEPARTMENT", d.deptName.toUpperCase());
    kv("DESIGNATION", d.staff.roleName.toUpperCase());
    kv("MANAGER / HOD", d.finalApprover.name.toUpperCase());
    kv("APPRAISAL MONTH / YEAR", appraisalMonth);
    kv("DATE OF REVIEW", d.oneOnOne ? dateLong(d.oneOnOne.meetingDate).toUpperCase() : "");

    heading("SUMMARY OVERVIEW");
    const cols = [30, 255, 70, 80, 80];
    row([{ w: cols[0], text: "Items" }, { w: cols[1], text: "Performance Evaluation" }, { w: cols[2], text: "Weightage", align: "center" }, { w: cols[3], text: "HOD", align: "center" }, { w: cols[4], text: "HR", align: "center" }], { header: true });
    const itemRow = (i: (typeof d.items)[number]) =>
      row([{ w: cols[0], text: String(i.itemNo) }, { w: cols[1], text: i.name }, { w: cols[2], text: `${i.weight}%`, align: "center" }, { w: cols[3], text: pct(contrib(i)), align: "center" }, { w: cols[4], text: "" }]);
    value.forEach(itemRow);
    row([{ w: cols[0] + cols[1], text: "Total", bold: true }, { w: cols[2], text: `${sum(value.map((i) => i.weight))}%`, bold: true, align: "center" }, { w: cols[3], text: pct(valuePct), bold: true, align: "center" }, { w: cols[4], text: "" }]);
    row([{ w: W, text: "Bonus Marks", bold: true, fill: SHADE }]);
    bonus.forEach(itemRow);
    row([{ w: cols[0] + cols[1], text: "TOTAL", bold: true }, { w: cols[2], text: `${sum(bonus.map((i) => i.weight))}%`, bold: true, align: "center" }, { w: cols[3], text: pct(bonusPct), bold: true, align: "center" }, { w: cols[4], text: "" }]);
    row([{ w: cols[0] + cols[1], text: "", bold: true }, { w: cols[2], text: `${sum(d.items.map((i) => i.weight))}%`, bold: true, align: "center" }, { w: cols[3], text: pct(valuePct + bonusPct), bold: true, align: "center" }, { w: cols[4], text: "" }]);

    heading("FINAL WEIGHTAGE");
    const fw = [30, 305, 90, 90];
    row([{ w: fw[0], text: "Items" }, { w: fw[1], text: "Performance Evaluation" }, { w: fw[2], text: "Weightage", align: "center" }, { w: fw[3], text: "Score", align: "center" }], { header: true });
    row([{ w: fw[0], text: "1" }, { w: fw[1], text: "KRA - Departmental" }, { w: fw[2], text: "60%", align: "center" }, { w: fw[3], text: pct(d.totals.kra), align: "center" }]);
    row([{ w: fw[0], text: "2" }, { w: fw[1], text: "Individual Assessment - Human Resources" }, { w: fw[2], text: "40%", align: "center" }, { w: fw[3], text: pct(d.totals.value), align: "center" }]);
    row([{ w: fw[0], text: "3" }, { w: fw[1], text: "Extra Assessment" }, { w: fw[2], text: "20%", align: "center" }, { w: fw[3], text: pct(d.totals.bonus), align: "center" }]);
    row([{ w: fw[0] + fw[1], text: "TOTAL", bold: true }, { w: fw[2], text: "120%", bold: true, align: "center" }, { w: fw[3], text: pct(total), bold: true, align: "center" }]);

    // ── Sections 1 and 2: each item with its scale, descriptions and comments ─
    const itemSection = (heads: string, items: typeof d.items) => {
      doc.addPage(); doc.y = doc.page.margins.top;
      text(title, { size: 8, color: GREY });
      text(heads, { size: 13, bold: true });
      gap(4);
      for (const i of items) {
        const s = byItem.get(i.id);
        const score = itemScore(i);
        const keysForHeight = Object.keys(i.bands);
        const commentText = [s?.reviewerComment, s?.finalComment, s?.selfComment].filter(Boolean).join("\n");
        const blockH =
          18 + (i.description ? hOf(i.description, W, 8) : 0) + 30 +
          (i.inputMode === "Certificates" ? 40 + Math.max(d.certs.length, 1) * 15 + 30 : keysForHeight.reduce((n, k) => n + Math.max(hOf(i.bands[k], W - 61, 8) + 6, 14), 14)) +
          14 + 14 + hOf(commentText, W, 9) + 14;
        need(Math.min(blockH, pageEnd() - doc.page.margins.top - 10));
        text(`${i.itemNo}. ${i.name} - ${i.weight}%`, { size: 10, bold: true });
        if (i.description) text(`(${i.description})`, { size: 8, color: GREY });
        gap(3);
        if (i.inputMode === "Certificates") {
          const w = [255, 70, 130, 60];
          row([{ w: w[0], text: "Certification Name" }, { w: w[1], text: "Date / Year" }, { w: w[2], text: "Category" }, { w: w[3], text: "Points", align: "center" }], { header: true });
          const ptsOf = (cat: string) => d.certConfig?.categories.find((c) => c.code === cat)?.points ?? 0;
          for (const c of d.certs) row([{ w: w[0], text: c.name }, { w: w[1], text: c.yearLabel ?? "" }, { w: w[2], text: c.category }, { w: w[3], text: String(ptsOf(c.category)), align: "center" }]);
          if (d.certs.length === 0) row([{ w: W, text: "No certificates listed" }]);
          row([{ w: w[0] + w[1] + w[2], text: "Total points", bold: true, align: "right" }, { w: w[3], text: String(cert.totalPoints), bold: true, align: "center" }]);
          gap(3);
          text(`Point-to-KPI score conversion: ${cert.score} / ${i.scaleMax}${cert.qualified ? "" : "  (needs at least one Core certificate to qualify)"}`, { size: 9 });
        } else {
          scaleStrip(i.scaleMax, score);
          gap(3);
          const keys = Object.keys(i.bands).sort((a, b) => startOf(a) - startOf(b));
          if (keys.length > 0) {
            row([{ w: 55, text: "Score" }, { w: W - 55, text: "Description" }], { header: true });
            for (const k of keys) {
              const on = inBand(k, score);
              row([{ w: 55, text: k, fill: on ? SHADE : undefined, bold: on }, { w: W - 55, text: i.bands[k], fill: on ? SHADE : undefined, bold: on }]);
            }
          }
        }
        gap(3);
        text(`Self: ${s?.selfRating ?? "-"}    Superior: ${s?.reviewerRating ?? "-"}    Final: ${score ?? "-"}`, { size: 8, color: GREY });
        const comments = [
          s?.reviewerComment && `Superior: ${s.reviewerComment}`,
          s?.finalComment && `HOD: ${s.finalComment}`,
          s?.selfComment && `Employee: ${s.selfComment}`,
        ].filter(Boolean) as string[];
        text("Comments:", { size: 9, bold: true });
        text(comments.length ? comments.join("\n") : " ", { size: 9 });
        gap(8);
      }
    };
    itemSection("SECTION 1: INDIVIDUAL EVALUATION", value);
    itemSection("SECTION 2: BONUS MARKS FRAMEWORK", bonus);

    // ── Section 3: outcome, recommendation, sign-off ─────────────────────────
    doc.addPage(); doc.y = doc.page.margins.top;
    text(title, { size: 8, color: GREY });
    text("SECTION 3: SUMMARY OUTCOME", { size: 13, bold: true });
    gap(4);
    row([{ w: 120, text: "KPI Score" }, { w: W - 120, text: "Outcome" }], { header: true });
    const bands = [...d.outcomeBands].sort((a, b) => a.minScore - b.minScore);
    bands.forEach((b, n) => {
      const next = bands[n + 1];
      const on = total >= b.minScore && (!next || total < next.minScore);
      const range = n === 0 ? `Below ${next?.minScore ?? 0}` : next ? `${b.minScore} to below ${next.minScore}` : `${b.minScore} and above`;
      row([{ w: 120, text: range, fill: on ? SHADE : undefined, bold: on }, { w: W - 120, text: b.outcome, fill: on ? SHADE : undefined, bold: on }]);
    });
    if (d.outcomeRemark) { gap(3); text(`Remark: ${d.outcomeRemark}`, { size: 8, color: GREY }); }
    gap(4);
    text(`Final score: ${total} / 120${outcome ? ` - ${outcome}` : ""}`, { size: 10, bold: true });

    gap(8);
    text("Career Progression Recommendation", { size: 10, bold: true });
    gap(2);
    row([{ w: 275, text: "Option" }, { w: 120, text: "HOD", align: "center" }, { w: 120, text: "SVP", align: "center" }], { header: true });
    for (const o of d.careerOptions) {
      row([{ w: 275, text: o }, { w: 120, text: (d.recommendations.hod ?? []).includes(o) ? "X" : "", align: "center", bold: true }, { w: 120, text: (d.recommendations.svp ?? []).includes(o) ? "X" : "", align: "center", bold: true }]);
    }
    gap(2);
    text("More than one option may be ticked, where applicable.", { size: 8, color: GREY });

    gap(8);
    text("Sign-off", { size: 10, bold: true });
    gap(2);
    const sw = W / 3;
    const sign = (label: string, name: string | null, date: string) => ({ label, name: name ?? "", date });
    const top = [
      sign("Employee", d.staff.name, dateLong(d.submittedAt.self)),
      sign("Reviewer", d.reviewer.name, dateLong(d.submittedAt.review)),
      sign("HOD", d.finalApprover.name, dateLong(d.submittedAt.finalised)),
    ];
    const bottom = [
      sign("SVP - Department", d.svpDept.signedBy, dateLong(d.svpDept.signedAt)),
      sign("SVP - Operations", d.svpOps.name, dateLong(d.svpOps.date)),
      sign("Received by Human Resources", null, ""),
    ];
    for (const set of [top, bottom]) {
      row(set.map((x) => ({ w: sw, text: x.label, bold: true })), { header: true });
      row(set.map((x) => ({ w: sw, text: `Name: ${x.name}\n\nSignature:\n\n` })));
      row(set.map((x) => ({ w: sw, text: `Date: ${x.date}` })));
      gap(6);
    }

    // ── Section 4: KRA assessment ───────────────────────────────────────────
    doc.addPage(); doc.y = doc.page.margins.top;
    text(title, { size: 8, color: GREY });
    text(`SECTION 4: KRA ASSESSMENT (${d.staff.roleName.toUpperCase()} - DEPARTMENTAL)`, { size: 13, bold: true });
    gap(2);
    text("Rating scale: 5 = Fully achieved / excellent, 4 = Substantially achieved / good, 3 = Meets minimum expectation, 2 = Needs improvement, 1 = Poor / not achieved. Weighted rating = Rating x Weightage.", { size: 8, color: GREY });
    gap(4);
    const kc = [20, 92, 118, 72, 40, 33, 140];
    row([{ w: kc[0], text: "No." }, { w: kc[1], text: "KRA Assessment" }, { w: kc[2], text: "What is measured" }, { w: kc[3], text: "Target" }, { w: kc[4], text: "Weightage", align: "center" }, { w: kc[5], text: "Rating (1-5)", align: "center" }, { w: kc[6], text: "Remarks / Evidence" }], { header: true, size: 7 });
    let weighted = 0;
    for (const l of d.lines) {
      const s = byLine.get(l.id);
      const r = finalOf(s);
      weighted += (r ?? 0) * l.weight;
      const remarks = [
        s?.selfEvidence && `Evidence: ${s.selfEvidence}`, s?.reviewerEvidence && `Superior evidence: ${s.reviewerEvidence}`,
        s?.selfComment && `Employee: ${s.selfComment}`, s?.reviewerComment && `Superior: ${s.reviewerComment}`, s?.finalComment && `HOD: ${s.finalComment}`,
      ].filter(Boolean) as string[];
      row([
        { w: kc[0], text: String(l.lineNo) }, { w: kc[1], text: l.name, bold: true }, { w: kc[2], text: l.measurement ?? "" }, { w: kc[3], text: l.target ?? "" },
        { w: kc[4], text: `${l.weight}%`, align: "center" }, { w: kc[5], text: r === null ? "-" : String(r), align: "center", bold: true }, { w: kc[6], text: remarks.join("\n") },
      ], { size: 7 });
    }
    need(40);
    row([{ w: kc[0] + kc[1] + kc[2] + kc[3], text: "TOTAL KRA WEIGHTAGE / SCORE", bold: true }, { w: kc[4], text: "100%", bold: true, align: "center" }, { w: kc[5] + kc[6], text: `${pct(d.totals.kra / 60 * 100)}`, bold: true, align: "center" }], { size: 8 });
    gap(3);
    text(`Weighted rating: ${Math.round(weighted) / 100} out of 5.00. Converted to 60% under Final Weightage: ${d.totals.kra}.`, { size: 8, color: GREY });

    // ── Section 4A: rating definitions per KRA ───────────────────────────────
    doc.addPage(); doc.y = doc.page.margins.top;
    text(title, { size: 8, color: GREY });
    text("SECTION 4A: KRA BASELINE AND RATING DEFINITION", { size: 13, bold: true });
    gap(4);
    if (Object.keys(d.ratingScale).length > 0) {
      row([{ w: 60, text: "Rating" }, { w: W - 60, text: "Definition baseline" }], { header: true });
      for (const k of ["5", "4", "3", "2", "1"]) if (d.ratingScale[k]) row([{ w: 60, text: k }, { w: W - 60, text: d.ratingScale[k] }]);
      gap(6);
    }
    for (const l of d.lines) {
      const r = finalOf(byLine.get(l.id));
      need(80);
      text(`${l.lineNo}. ${l.name}`, { size: 10, bold: true });
      if (l.target) text(`Target: ${l.target}`, { size: 8, color: GREY });
      gap(2);
      row([{ w: 60, text: "Rating" }, { w: W - 60, text: "Baseline" }], { header: true });
      for (const k of ["5", "4", "3", "2", "1"]) {
        const on = r === Number(k);
        row([{ w: 60, text: k, fill: on ? SHADE : undefined, bold: on }, { w: W - 60, text: l.bands[k] ?? "", fill: on ? SHADE : undefined, bold: on }]);
      }
      gap(8);
    }

    // Footer on every page
    const range = doc.bufferedPageRange();
    for (let n = range.start; n < range.start + range.count; n++) {
      doc.switchToPage(n);
      const keep = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(7.5).fillColor(GREY).text(
        `10 Creative Solutions Sdn Bhd (Private & Confidential)   |   ${title}   |   ${plain(d.staff.name)}   |   Page ${n + 1} of ${range.count}`,
        L, doc.page.height - 28, { width: W, align: "center", lineBreak: false });
      doc.page.margins.bottom = keep;
    }
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
  const lines = rows.map((r) => [r.name, r.roleName, r.subTeam, r.reviewerName, r.finalApproverName, r.status, r.kra, r.value, r.bonus, r.total, r.outcome, r.finalisedAt ? dateIso(r.finalisedAt) : ""].map(csvCell).join(","));
  return Buffer.from("﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n", "utf8");
}
