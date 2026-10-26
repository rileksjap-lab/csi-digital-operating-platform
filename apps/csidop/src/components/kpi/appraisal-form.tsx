"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import { appraisalTotals, certificateScore, outcomeFor, type CertConfig, type OutcomeBand, type ScoredEntry } from "@/lib/kpi/scoring";
import {
  ratingAt, stageProblems, STATUS_LABEL,
  type AppraisalStatus, type ItemMeta, type LineMeta, type ScoreRow, type Stage, type WorkflowAction,
} from "@/lib/kpi/workflow";

// The appraisal form. One page for every step: the same layout shows the
// self-assessment, the superior's ratings and the HOD's final ratings side by
// side, and only the part the signed-in person may edit right now is editable.

interface Line extends LineMeta {
  lineNo: number; weight: number; target: string | null; measurement: string | null; explanation: string | null;
  autoMetric: string | null; bands: Record<string, string>;
}
interface Item extends ItemMeta {
  itemNo: number; weight: number; section: "Value" | "Bonus"; description: string | null; bands: Record<string, string>;
}
interface Cert { id?: string; name: string; yearLabel: string | null; category: string }
interface Detail {
  id: string; cycleId: string; status: AppraisalStatus; returnNote: string | null;
  staff: { id: string; name: string; roleName: string; subTeam: string | null };
  reviewer: { id: string; name: string };
  finalApprover: { id: string; name: string };
  lines: Line[]; items: Item[]; careerOptions: string[]; certConfig: CertConfig | null; outcomeBands: OutcomeBand[];
  scores: ScoreRow[]; certs: Cert[];
  oneOnOne: { meetingDate: string; notes: string | null; agreedActions: string | null; employeeAckAt: string | null } | null;
  totals: { kra: number; value: number; bonus: number; total: number; outcome: string | null };
  snapshot: { total: number | null; outcome: string | null } | null;
  editable: { self: boolean; reviewer: boolean; final: boolean; oneOnOne: boolean; acknowledge: boolean };
  actions: WorkflowAction[];
  ratingsHidden: boolean;
  recommendations: { hod?: string[]; svp?: string[] };
  svpOps: { name: string | null; date: string | null };
  svpDept: { signedAt: string | null; signedBy: string | null };
  signOffRights: { hodTicks: boolean; svpTicks: boolean; opsName: boolean; svpSign: boolean };
}

interface Draft { rating: number | null; comment: string; evidence: string }
type Drafts = Record<string, Draft>;
const EMPTY_DRAFT: Draft = { rating: null, comment: "", evidence: "" };
const keyOf = (lineId: string | null, itemId: string | null) => (lineId ? `L:${lineId}` : `I:${itemId}`);

const STEPS: { key: AppraisalStatus; label: string }[] = [
  { key: "SelfAssessment", label: "Self-assessment" },
  { key: "SuperiorReview", label: "Superior review" },
  { key: "HODReview", label: "HOD review" },
  { key: "Finalised", label: "Finalised" },
  { key: "SentToHR", label: "Sent to HR" },
];

const field = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50";
const btn = "rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40";
const primary = "rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40";

/** The description for a score, from bands keyed like "7-8", "5" or "0". */
function bandText(bands: Record<string, string>, score: number | null): string | null {
  if (score === null) return null;
  for (const [k, v] of Object.entries(bands)) {
    const m = k.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m ? score >= Number(m[1]) && score <= Number(m[2]) : Number(k) === score) return v;
  }
  return null;
}

/** True when a definition key ("5", "7-8") covers the given score. */
function keyCovers(key: string, score: number | null): boolean {
  if (score === null) return false;
  const m = key.match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? score >= Number(m[1]) && score <= Number(m[2]) : Number(key) === score;
}

/**
 * The meaning of every rating, always visible next to the rating buttons, as on
 * the paper form. KRA lines list 5 down to 1; HR and bonus items list their
 * score ranges from low to high. The rating currently shown is highlighted.
 */
function Definitions({ bands, highlight }: { bands: Record<string, string>; highlight: number | null }) {
  const keys = Object.keys(bands).filter((k) => bands[k]?.trim());
  if (keys.length === 0) return null;
  const single = keys.every((k) => /^\d+$/.test(k)) && keys.length <= 5 && keys.includes("5") && keys.includes("1");
  const start = (k: string) => Number((k.match(/^\d+/) ?? ["0"])[0]);
  const sorted = [...keys].sort((a, b) => (single ? start(b) - start(a) : start(a) - start(b)));
  return (
    <div className="mt-2 rounded border border-gray-100 bg-gray-50/70 px-3 py-2 text-xs">
      <div className="mb-1 font-medium text-gray-500">What each {single ? "rating" : "score"} means</div>
      <ul className="space-y-0.5">
        {sorted.map((k) => {
          const on = keyCovers(k, highlight);
          return (
            <li key={k} className={`flex gap-2 rounded px-1 py-0.5 ${on ? "bg-primary-50 font-medium text-primary-800" : "text-gray-600"}`}>
              <span className="w-9 shrink-0 font-medium">{k}</span>
              <span>{bands[k]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function stageOf(d: Detail): Stage | null {
  return d.editable.self ? "self" : d.editable.reviewer ? "reviewer" : d.editable.final ? "final" : null;
}

function initialDrafts(d: Detail, stage: Stage | null): Drafts {
  const out: Drafts = {};
  if (!stage) return out;
  const rows = new Map(d.scores.map((s) => [keyOf(s.lineId, s.itemId), s]));
  const blank = { rating: null, comment: "", evidence: "" };
  const read = (s?: ScoreRow): Draft => {
    if (!s) return blank;
    if (stage === "self") return { rating: s.selfRating, comment: s.selfComment ?? "", evidence: s.selfEvidence ?? "" };
    if (stage === "reviewer") return { rating: s.reviewerRating, comment: s.reviewerComment ?? "", evidence: s.reviewerEvidence ?? "" };
    return { rating: s.finalRating, comment: s.finalComment ?? "", evidence: "" };
  };
  for (const l of d.lines) out[`L:${l.id}`] = read(rows.get(`L:${l.id}`));
  for (const i of d.items) if (i.inputMode === "Rating") out[`I:${i.id}`] = read(rows.get(`I:${i.id}`));
  return out;
}

/** The score rows as they would be if the current drafts were saved. */
function withDrafts(d: Detail, stage: Stage | null, drafts: Drafts): ScoreRow[] {
  const byKey = new Map(d.scores.map((s) => [keyOf(s.lineId, s.itemId), { ...s }]));
  if (stage) {
    for (const [k, v] of Object.entries(drafts)) {
      const [kind, id] = [k[0], k.slice(2)];
      const row: ScoreRow = byKey.get(k) ?? {
        lineId: kind === "L" ? id : null, itemId: kind === "I" ? id : null,
        selfRating: null, selfComment: null, selfEvidence: null, reviewerRating: null, reviewerComment: null,
        reviewerEvidence: null, finalRating: null, finalComment: null,
      };
      if (stage === "self") Object.assign(row, { selfRating: v.rating, selfComment: v.comment || null, selfEvidence: v.evidence || null });
      else if (stage === "reviewer") Object.assign(row, { reviewerRating: v.rating, reviewerComment: v.comment || null, reviewerEvidence: v.evidence || null });
      else Object.assign(row, { finalRating: v.rating, finalComment: v.comment || null });
      byKey.set(k, row);
    }
  }
  return [...byKey.values()];
}

async function call<T>(method: string, url: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string; problems: string[] }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) { window.location.href = "/login"; return { ok: false, message: "Signed out", problems: [] }; }
  const json = await res.json().catch(() => null);
  if (!json?.success) {
    return { ok: false, message: json?.error?.message ?? "Request failed", problems: (json?.error?.errors ?? []).map((e: { message: string }) => e.message) };
  }
  return { ok: true, data: json.data as T };
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function Scoreboard({ totals, partial }: { totals: Detail["totals"]; partial: boolean }) {
  const card = (label: string, value: number, max: number, tone: string) => (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-3xl font-semibold leading-tight text-gray-800">{value}<span className="text-base font-normal text-gray-400"> / {max}</span></div>
    </div>
  );
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {card("KRA (departmental)", totals.kra, 60, "border-gray-200 bg-white")}
        {card("HR items", totals.value, 40, "border-gray-200 bg-white")}
        {card("Bonus items", totals.bonus, 20, "border-gray-200 bg-white")}
        {card("Total", totals.total, 120, "border-primary-200 bg-primary-50")}
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {partial ? "Running total from the ratings entered so far. " : ""}
        {totals.outcome ? <>Outcome at this score: <span className="font-medium text-gray-700">{totals.outcome}</span></> : null}
      </p>
    </div>
  );
}

function Steps({ status }: { status: AppraisalStatus }) {
  const at = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {STEPS.map((s, i) => (
        <li key={s.key} className={`rounded-full px-3 py-1 ${i === at ? "bg-primary-600 text-white" : i < at ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
          {i < at ? "✓ " : ""}{s.label}
        </li>
      ))}
    </ol>
  );
}

function RatingPicker({ max, value, onChange }: { max: number; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: max }, (_, k) => k + 1).map((n) => (
        <button
          key={n} type="button" onClick={() => onChange(value === n ? null : n)} aria-pressed={value === n}
          className={`h-8 w-8 rounded border text-sm ${value === n ? "border-primary-600 bg-primary-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

interface BoxProps {
  title: string; max: number; bands: Record<string, string>;
  editing: boolean; draft?: Draft; onDraft: (d: Draft) => void;
  rating: number | null; comment: string | null; evidence: string | null;
  commentLabel: string; showEvidence: boolean;
}

function RatingBox(p: BoxProps) {
  const shown = p.editing ? p.draft!.rating : p.rating;
  const meaning = bandText(p.bands, shown);
  return (
    <div className="min-w-[220px] flex-1 rounded border border-gray-200 bg-gray-50/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{p.title}</span>
        {!p.editing && <span className="text-2xl font-semibold text-gray-800">{p.rating ?? "–"}</span>}
      </div>
      {p.editing ? (
        <div className="space-y-2">
          <RatingPicker max={p.max} value={p.draft!.rating} onChange={(rating) => p.onDraft({ ...p.draft!, rating })} />
          {p.showEvidence && (
            <label className="block text-xs text-gray-500">Evidence (records, files, trackers)
              <textarea rows={2} value={p.draft!.evidence} onChange={(e) => p.onDraft({ ...p.draft!, evidence: e.target.value })} className={`${field} mt-1`} />
            </label>
          )}
          <label className="block text-xs text-gray-500">{p.commentLabel}
            <textarea rows={2} value={p.draft!.comment} onChange={(e) => p.onDraft({ ...p.draft!, comment: e.target.value })} className={`${field} mt-1`} />
          </label>
        </div>
      ) : (
        <div className="space-y-1 text-sm text-gray-600">
          {p.evidence && <p><span className="text-xs text-gray-400">Evidence: </span>{p.evidence}</p>}
          {p.comment && <p><span className="text-xs text-gray-400">{p.commentLabel}: </span>{p.comment}</p>}
        </div>
      )}
      {meaning && <p className="mt-2 text-xs italic text-gray-500">{shown}: {meaning}</p>}
    </div>
  );
}

// ── The form ────────────────────────────────────────────────────────────────

export default function AppraisalForm({ id }: { id: string }) {
  const { data, error, mutate } = useSWR<Detail>(`/api/kpi/appraisals/${id}`, apiFetcher, { revalidateOnFocus: false });
  const [drafts, setDrafts] = useState<Drafts>({});
  const [certs, setCerts] = useState<Cert[]>([]);
  const [meeting, setMeeting] = useState({ meetingDate: "", notes: "", agreedActions: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; problems?: string[] } | null>(null);
  const [rec, setRec] = useState<{ hod: string[]; svp: string[] }>({ hod: [], svp: [] });
  const [ops, setOps] = useState({ name: "", date: "" });
  const [noteFor, setNoteFor] = useState<WorkflowAction | null>(null);
  const [note, setNote] = useState("");

  const stage = data ? stageOf(data) : null;

  useEffect(() => {
    if (!data) return;
    setDrafts(initialDrafts(data, stageOf(data)));
    setCerts(data.certs);
    setMeeting({ meetingDate: data.oneOnOne?.meetingDate ?? "", notes: data.oneOnOne?.notes ?? "", agreedActions: data.oneOnOne?.agreedActions ?? "" });
    setRec({ hod: data.recommendations?.hod ?? [], svp: data.recommendations?.svp ?? [] });
    setOps({ name: data.svpOps?.name ?? "", date: data.svpOps?.date ?? "" });
    setNoteFor(null); setNote("");
  }, [data]);

  const rows = useMemo(() => (data ? withDrafts(data, stage, drafts) : []), [data, stage, drafts]);
  const certEditable = !!data && (data.editable.self || data.editable.reviewer || data.editable.final);
  const certResult = useMemo(
    () => (data?.certConfig ? certificateScore(certs, data.certConfig) : { totalPoints: 0, qualified: false, score: 0 }),
    [data, certs]
  );
  const viewStage: Stage = !data ? "self" : data.ratingsHidden ? "self" : stage ?? (data.status === "SelfAssessment" ? "self" : data.status === "SuperiorReview" ? "reviewer" : "final");

  const live = useMemo(() => {
    if (!data) return null;
    const byLine = new Map(rows.filter((r) => r.lineId).map((r) => [r.lineId as string, r]));
    const byItem = new Map(rows.filter((r) => r.itemId).map((r) => [r.itemId as string, r]));
    const entry = (i: Item): ScoredEntry => ({
      weight: i.weight, scaleMax: i.scaleMax,
      score: i.inputMode === "Certificates" ? certResult.score : byItem.has(i.id) ? ratingAt(byItem.get(i.id)!, viewStage) : null,
    });
    const t = appraisalTotals({
      kra: data.lines.map((l) => ({ weight: l.weight, scaleMax: 5, score: byLine.has(l.id) ? ratingAt(byLine.get(l.id)!, viewStage) : null })),
      value: data.items.filter((i) => i.section === "Value").map(entry),
      bonus: data.items.filter((i) => i.section === "Bonus").map(entry),
    });
    return { ...t, outcome: outcomeFor(t.total, data.outcomeBands) };
  }, [data, rows, viewStage, certResult]);

  if (error) return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>;
  if (!data || !live) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;

  const d = data;
  const reviewerIsApprover = d.reviewer.id === d.finalApprover.id;
  const editing = stage !== null;
  const rowByKey = new Map(d.scores.map((s) => [keyOf(s.lineId, s.itemId), s]));

  // What is still missing, from the screen as it is now (not only what is saved).
  const missing: string[] = [];
  if (stage) missing.push(...stageProblems(stage, d.lines, d.items, rows));
  if (stage === "reviewer" && !meeting.meetingDate) missing.push("Record the 1:1 meeting");

  const setDraft = (k: string, v: Draft) => { setDrafts((p) => ({ ...p, [k]: v })); setMessage(null); };

  async function save(): Promise<boolean> {
    if (!stage) return saveSignOffOnly();
    const scores = Object.entries(drafts).map(([k, v]) => ({
      ...(k[0] === "L" ? { lineId: k.slice(2) } : { itemId: k.slice(2) }),
      rating: v.rating, comment: v.comment || null, evidence: stage === "final" ? null : v.evidence || null,
    }));
    const r1 = await call("PUT", `/api/kpi/appraisals/${id}/scores`, { scores });
    if (!r1.ok) { setMessage({ kind: "error", text: r1.message }); return false; }
    if (certEditable) {
      const r2 = await call("PUT", `/api/kpi/appraisals/${id}/certs`, { certs: certs.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), yearLabel: c.yearLabel, category: c.category })) });
      if (!r2.ok) { setMessage({ kind: "error", text: r2.message }); return false; }
    }
    const r = d.signOffRights;
    if (r.hodTicks || r.svpTicks || r.opsName) {
      const body: Record<string, unknown> = {};
      if (r.hodTicks) body.hodTicks = rec.hod;
      if (r.svpTicks) body.svpTicks = rec.svp;
      if (r.opsName) { body.opsName = ops.name || null; body.opsDate = ops.date || null; }
      const r4 = await call("PUT", `/api/kpi/appraisals/${id}/sign-off`, body);
      if (!r4.ok) { setMessage({ kind: "error", text: r4.message }); return false; }
    }
    if (d.editable.oneOnOne && meeting.meetingDate) {
      const r3 = await call("PUT", `/api/kpi/appraisals/${id}/one-on-one`, meeting);
      if (!r3.ok) { setMessage({ kind: "error", text: r3.message }); return false; }
    }
    return true;
  }

  async function saveSignOffOnly(signNow = false): Promise<boolean> {
    const r = d.signOffRights;
    if (!(r.hodTicks || r.svpTicks || r.opsName || signNow)) return true;
    const body: Record<string, unknown> = {};
    if (r.hodTicks) body.hodTicks = rec.hod;
    if (r.svpTicks) body.svpTicks = rec.svp;
    if (r.opsName) { body.opsName = ops.name || null; body.opsDate = ops.date || null; }
    if (signNow) body.svpSign = true;
    const res = await call("PUT", `/api/kpi/appraisals/${id}/sign-off`, body);
    if (!res.ok) { setMessage({ kind: "error", text: res.message }); return false; }
    return true;
  }

  async function saveDraft() {
    setBusy(true); setMessage(null);
    if (await save()) { await mutate(); setMessage({ kind: "ok", text: "Saved." }); }
    setBusy(false);
  }

  async function run(action: WorkflowAction, withNote?: string) {
    setBusy(true); setMessage(null);
    if (!(await save())) { setBusy(false); return; }
    const r = await call("POST", `/api/kpi/appraisals/${id}/transition`, { action, note: withNote ?? null });
    if (!r.ok) setMessage({ kind: "error", text: r.message, problems: r.problems });
    else { setNoteFor(null); setNote(""); await mutate(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    setBusy(false);
  }

  async function acknowledge() {
    setBusy(true);
    const r = await call("POST", `/api/kpi/appraisals/${id}/one-on-one`);
    if (!r.ok) setMessage({ kind: "error", text: r.message }); else await mutate();
    setBusy(false);
  }

  const has = (a: WorkflowAction) => d.actions.includes(a);
  const needsNote: WorkflowAction[] = ["returnToStaff", "returnToReviewer", "reopen"];
  const showReviewer = !d.ratingsHidden && d.status !== "SelfAssessment";
  const showFinal = !d.ratingsHidden && (d.status === "HODReview" || d.status === "Finalised" || d.status === "SentToHR");

  /** The rating to highlight in the definitions: the one being typed, or the latest saved one. */
  const shownRating = (kind: "L" | "I", rowId: string): number | null => {
    const k = `${kind}:${rowId}`;
    if (stage) return drafts[k]?.rating ?? null;
    const s = rowByKey.get(k);
    return s ? ratingAt(s, viewStage) : null;
  };

  const ratingRow = (kind: "L" | "I", rowId: string, max: number, bands: Record<string, string>, evidenceRequired: boolean) => {
    const k = `${kind}:${rowId}`;
    const s = rowByKey.get(k);
    const draft = drafts[k] ?? EMPTY_DRAFT;
    return (
      <div className="mt-3 flex flex-wrap gap-3">
        <RatingBox
          title="Self" max={max} bands={bands} editing={stage === "self"} draft={draft} onDraft={(v) => setDraft(k, v)}
          rating={s?.selfRating ?? null} comment={s?.selfComment ?? null} evidence={s?.selfEvidence ?? null}
          commentLabel="Remarks" showEvidence={kind === "L" || evidenceRequired}
        />
        {(showReviewer || stage === "reviewer") && (
          <RatingBox
            title="Superior" max={max} bands={bands} editing={stage === "reviewer"} draft={draft} onDraft={(v) => setDraft(k, v)}
            rating={s?.reviewerRating ?? null} comment={s?.reviewerComment ?? null} evidence={s?.reviewerEvidence ?? null}
            commentLabel="Remarks" showEvidence={kind === "L" || evidenceRequired}
          />
        )}
        {(showFinal || stage === "final") && (
          <RatingBox
            title="Final (HOD / SVP)" max={max} bands={bands} editing={stage === "final"} draft={draft} onDraft={(v) => setDraft(k, v)}
            rating={s?.finalRating ?? null} comment={s?.finalComment ?? null} evidence={null}
            commentLabel="Reason if changed" showEvidence={false}
          />
        )}
      </div>
    );
  };

  const valueItems = d.items.filter((i) => i.section === "Value");
  const bonusItems = d.items.filter((i) => i.section === "Bonus");
  const itemCard = (i: Item) => (
    <li key={i.id} className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">{i.itemNo}. {i.name} <span className="font-normal text-gray-400">· {i.weight}%</span></h3>
        <span className="text-xs text-gray-400">Score 1 to {i.scaleMax}</span>
      </div>
      {i.description && <p className="text-xs text-gray-500">{i.description}</p>}
      {i.inputMode === "Certificates" ? (
        <div className="mt-3 space-y-2">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1 pr-2">Certification</th><th className="pb-1 pr-2">Year</th><th className="pb-1 pr-2">Category</th><th className="pb-1 pr-2">Points</th><th /></tr></thead>
            <tbody>
              {certs.map((c, n) => {
                const rule = d.certConfig?.categories.find((x) => x.code === c.category);
                return (
                  <tr key={n}>
                    <td className="pr-2 pb-1"><input value={c.name} disabled={!certEditable} onChange={(e) => setCerts((cs) => cs.map((x, k) => (k === n ? { ...x, name: e.target.value } : x)))} className={field} /></td>
                    <td className="pr-2 pb-1"><input value={c.yearLabel ?? ""} disabled={!certEditable} onChange={(e) => setCerts((cs) => cs.map((x, k) => (k === n ? { ...x, yearLabel: e.target.value } : x)))} className={`${field} w-24`} /></td>
                    <td className="pr-2 pb-1">
                      <select value={c.category} disabled={!certEditable} onChange={(e) => setCerts((cs) => cs.map((x, k) => (k === n ? { ...x, category: e.target.value } : x)))} className={field}>
                        {d.certConfig?.categories.map((x) => <option key={x.code} value={x.code}>{x.code}</option>)}
                      </select>
                    </td>
                    <td className="pr-2 pb-1 text-gray-600">{rule?.points ?? 0}</td>
                    <td className="pb-1">{certEditable && <button onClick={() => setCerts((cs) => cs.filter((_, k) => k !== n))} className="text-xs text-red-600">Remove</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {certEditable && d.certConfig && (
            <button onClick={() => setCerts((cs) => [...cs, { name: "", yearLabel: "", category: d.certConfig!.categories[0].code }])} className={btn}>+ Add a certificate</button>
          )}
          <p className="text-sm text-gray-700">
            Total points <span className="font-semibold">{certResult.totalPoints}</span> → item score{" "}
            <span className="text-lg font-semibold">{certResult.score}</span> / {i.scaleMax}
            {!certResult.qualified && <span className="ml-2 text-xs text-amber-700">At least one Core certificate is needed to qualify.</span>}
          </p>
        </div>
      ) : (
        <>
          <Definitions bands={i.bands} highlight={shownRating("I", i.id)} />
          {ratingRow("I", i.id, i.scaleMax, i.bands, false)}
        </>
      )}
    </li>
  );

  return (
    <div className="space-y-6 pb-28">
      <div>
        <Link href="/kpi/appraisals" className="text-xs text-gray-500 hover:text-gray-700">← KPI Appraisals</Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">{d.staff.name}</h1>
            <p className="text-sm text-gray-500">
              {d.staff.roleName}{d.staff.subTeam ? ` · Pod ${d.staff.subTeam}` : ""} · Reviewer: {d.reviewer.name} · Final: {d.finalApprover.name}
            </p>
          </div>
          <Steps status={d.status} />
        </div>
      </div>

      {d.returnNote && (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-medium">Sent back: </span>{d.returnNote}
        </div>
      )}
      {d.ratingsHidden && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Your superior&apos;s and the HOD&apos;s ratings are shown here once the appraisal is finalised.
        </div>
      )}
      {!editing && d.status !== "Finalised" && d.status !== "SentToHR" && (
        <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {d.status === "SelfAssessment" ? `Waiting for ${d.staff.name} to submit the self-assessment.`
            : d.status === "SuperiorReview" ? `Waiting for ${d.reviewer.name} to review and record the 1:1.`
            : `Waiting for ${d.finalApprover.name} to set the final score.`}
        </div>
      )}

      <Scoreboard totals={live} partial={d.status !== "Finalised" && d.status !== "SentToHR"} />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">A. KRA, departmental (60 points)</h2>
        <ul className="space-y-3">
          {d.lines.map((l) => (
            <li key={l.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-800">{l.lineNo}. {l.name} <span className="font-normal text-gray-400">· {l.weight}%</span></h3>
                {l.target && <span className="text-xs text-gray-500">Target: {l.target}</span>}
              </div>
              {l.explanation && <p className="text-xs text-gray-500">{l.explanation}</p>}
              {l.measurement && <p className="mt-1 text-xs text-gray-500">What is measured: {l.measurement}</p>}
              <Definitions bands={l.bands} highlight={shownRating("L", l.id)} />
              {ratingRow("L", l.id, 5, l.bands, l.evidenceRequired)}
              {stage && l.evidenceRequired && (drafts[`L:${l.id}`]?.rating ?? 0) > 3 && !drafts[`L:${l.id}`]?.evidence.trim() && !(rowByKey.get(`L:${l.id}`)?.selfEvidence) && (
                <p className="mt-2 text-xs text-amber-700">A rating above 3 needs supporting evidence.</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">B. HR items (40 points)</h2>
        <ul className="space-y-3">{valueItems.map(itemCard)}</ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">C. Bonus items (20 points)</h2>
        <ul className="space-y-3">{bonusItems.map(itemCard)}</ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">D. 1:1 meeting with the immediate superior</h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          {d.editable.oneOnOne ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-gray-500">Date of meeting
                <input type="date" value={meeting.meetingDate} onChange={(e) => setMeeting((m) => ({ ...m, meetingDate: e.target.value }))} className={`${field} mt-1`} />
              </label>
              <span />
              <label className="text-xs text-gray-500">Discussion notes
                <textarea rows={3} value={meeting.notes} onChange={(e) => setMeeting((m) => ({ ...m, notes: e.target.value }))} className={`${field} mt-1`} />
              </label>
              <label className="text-xs text-gray-500">Agreed actions
                <textarea rows={3} value={meeting.agreedActions} onChange={(e) => setMeeting((m) => ({ ...m, agreedActions: e.target.value }))} className={`${field} mt-1`} />
              </label>
            </div>
          ) : d.oneOnOne ? (
            <div className="space-y-1 text-sm text-gray-700">
              <p><span className="text-xs text-gray-400">Date: </span>{d.oneOnOne.meetingDate}</p>
              {d.oneOnOne.notes && <p><span className="text-xs text-gray-400">Notes: </span>{d.oneOnOne.notes}</p>}
              {d.oneOnOne.agreedActions && <p><span className="text-xs text-gray-400">Agreed actions: </span>{d.oneOnOne.agreedActions}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-500">The 1:1 has not been recorded yet.</p>
          )}
          {d.oneOnOne && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-sm">
              {d.oneOnOne.employeeAckAt ? (
                <span className="text-green-700">✓ {d.staff.name} confirmed the meeting took place.</span>
              ) : d.editable.acknowledge ? (
                <button onClick={acknowledge} disabled={busy} className={btn}>I confirm this meeting took place</button>
              ) : (
                <span className="text-gray-500">Not yet confirmed by {d.staff.name}.</span>
              )}
            </div>
          )}
        </div>
      </section>

      {!d.ratingsHidden && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-gray-800">E. Recommendation and sign-off</h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">Career progression recommendation. More than one option can be ticked.</p>
            <table className="mt-2 w-full max-w-md text-sm">
              <thead><tr className="text-left text-xs text-gray-500"><th className="pb-1">Option</th><th className="pb-1 text-center">HOD</th><th className="pb-1 text-center">SVP</th></tr></thead>
              <tbody>
                {d.careerOptions.map((o) => (
                  <tr key={o} className="border-t border-gray-50">
                    <td className="py-1 pr-3 text-gray-700">{o}</td>
                    {(["hod", "svp"] as const).map((col) => {
                      const can = col === "hod" ? d.signOffRights.hodTicks : d.signOffRights.svpTicks;
                      return (
                        <td key={col} className="py-1 text-center">
                          <input
                            type="checkbox" checked={rec[col].includes(o)} disabled={!can}
                            aria-label={`${o}, ${col.toUpperCase()}`}
                            onChange={(e) => setRec((r) => ({ ...r, [col]: e.target.checked ? [...r[col], o] : r[col].filter((x) => x !== o) }))}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 grid gap-3 border-t border-gray-100 pt-3 md:grid-cols-2">
              <label className="text-xs text-gray-500">SVP-Operations: name
                <input value={ops.name} disabled={!d.signOffRights.opsName} onChange={(e) => setOps((o) => ({ ...o, name: e.target.value }))} className={`${field} mt-1`} />
              </label>
              <label className="text-xs text-gray-500">SVP-Operations: date
                <input type="date" value={ops.date} disabled={!d.signOffRights.opsName} onChange={(e) => setOps((o) => ({ ...o, date: e.target.value }))} className={`${field} mt-1`} />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-sm">
              <span className="text-gray-700">SVP-Department:</span>
              {d.svpDept.signedAt ? (
                <span className="text-green-700">✓ Signed by {d.svpDept.signedBy} on {new Date(d.svpDept.signedAt).toISOString().slice(0, 10)}</span>
              ) : d.signOffRights.svpSign ? (
                <button
                  disabled={busy}
                  onClick={async () => { setBusy(true); setMessage(null); if (await saveSignOffOnly(true)) await mutate(); setBusy(false); }}
                  className={btn}
                >
                  Sign as SVP-Department
                </button>
              ) : (
                <span className="text-gray-500">Not signed yet</span>
              )}
              {(d.signOffRights.hodTicks || d.signOffRights.svpTicks || d.signOffRights.opsName) && !editing && (
                <button disabled={busy} onClick={async () => { setBusy(true); setMessage(null); if (await saveSignOffOnly()) { await mutate(); setMessage({ kind: "ok", text: "Sign-off saved." }); } setBusy(false); }} className={btn}>
                  Save sign-off
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {(editing || d.actions.length > 0 || d.signOffRights.hodTicks || d.signOffRights.svpTicks || d.signOffRights.opsName) && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-6 py-3 backdrop-blur lg:left-60">
          {message && (
            <div className={`mb-2 rounded px-3 py-2 text-sm ${message.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {message.text}
              {message.problems && message.problems.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">{message.problems.slice(0, 8).map((p, n) => <li key={n}>{p}</li>)}{message.problems.length > 8 && <li>and {message.problems.length - 8} more</li>}</ul>
              )}
            </div>
          )}
          {noteFor ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[280px] flex-1 text-xs text-gray-500">Why? (shown to the person who has to act)
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1`} />
              </label>
              <button onClick={() => run(noteFor, note)} disabled={busy || !note.trim()} className={primary}>Confirm</button>
              <button onClick={() => { setNoteFor(null); setNote(""); }} className={btn}>Cancel</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {editing && <button onClick={saveDraft} disabled={busy} className={btn}>Save draft</button>}
              {has("submitSelf") && <button onClick={() => run("submitSelf")} disabled={busy} className={primary}>Submit to my superior</button>}
              {has("submitReview") && <button onClick={() => run("submitReview")} disabled={busy} className={primary}>{reviewerIsApprover ? "Submit review and finalise" : "Submit review to HOD"}</button>}
              {has("finalise") && <button onClick={() => run("finalise")} disabled={busy} className={primary}>Finalise</button>}
              {needsNote.filter(has).map((a) => (
                <button key={a} onClick={() => setNoteFor(a)} disabled={busy} className={btn}>
                  {a === "returnToStaff" ? "Return to staff" : a === "returnToReviewer" ? "Return to superior" : "Reopen"}
                </button>
              ))}
              {editing && missing.length > 0 && (
                <span className="text-xs text-amber-700">{missing.length} item{missing.length === 1 ? "" : "s"} to complete before submitting: {missing[0]}{missing.length > 1 ? "…" : ""}</span>
              )}
              {(d.status === "Finalised" || d.status === "SentToHR") && (
                <a href={`/api/kpi/appraisals/${d.id}/pdf`} className={btn}>Download PDF</a>
              )}
              {!editing && <span className="text-xs text-gray-500">{STATUS_LABEL[d.status]}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
