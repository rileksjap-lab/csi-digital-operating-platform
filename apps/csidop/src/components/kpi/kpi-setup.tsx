"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPut, apiPatch } from "@/lib/api/fetcher";
import { KPI_METRICS } from "@/lib/kpi/metrics";
import KpiReportingLines from "@/components/kpi/kpi-reporting-lines";

// Editor for the KPI appraisal configuration. Everything on the form (lines,
// weights, targets, rating bands, HR items, outcome table, certification
// points) is stored in the database and edited here; nothing is fixed in code.

interface Cycle { id: string; cycleCode: string; name: string; periodStart: string; periodEnd: string; status: "Draft" | "Open" | "Closed" }
interface Line {
  id: string; lineNo: number; name: string; measurement: string | null; target: string | null; explanation: string | null;
  weight: number; evidenceRequired: boolean; autoMetric: string | null; bands: Record<string, string>;
}
interface Template { id: string; displayName: string; roleCode: string; roleName: string; lines: Line[] }
interface Item {
  id: string; itemNo: number; section: "Value" | "Bonus"; name: string; description: string | null;
  weight: number; scaleMax: number; inputMode: "Rating" | "Certificates"; bands: Record<string, string>;
}
interface CertConfig { categories: { code: string; points: number; maxTotal?: number; minCount?: number }[]; scoreCap: number }
interface Config {
  cycle: Cycle & { config: { certificates?: CertConfig; hrEmails?: string[] } };
  templates: Template[];
  items: Item[];
  outcomeBands: { minScore: number; outcome: string }[];
}

const input = "w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-500";
const btn = "rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40";
const primaryBtn = "rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40";
const round2 = (n: number) => Math.round(n * 100) / 100;

function SaveBar({ problem, dirty, saving, error, onSave, done }: {
  problem: string | null; dirty: boolean; saving: boolean; error: string | null; onSave: () => void; done: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
      <button onClick={onSave} disabled={!dirty || !!problem || saving} className={primaryBtn}>
        {saving ? "Saving…" : "Save changes"}
      </button>
      {problem && <span className="text-sm text-red-600">{problem}</span>}
      {!problem && !dirty && done && <span className="text-sm text-green-700">Saved.</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

// ── Role templates ──────────────────────────────────────────────────────────

interface LineDraft {
  id?: string; name: string; measurement: string; target: string; explanation: string;
  weight: string; evidenceRequired: boolean; autoMetric: string; bands: Record<string, string>;
}

const toLineDraft = (l: Line): LineDraft => ({
  id: l.id, name: l.name, measurement: l.measurement ?? "", target: l.target ?? "", explanation: l.explanation ?? "",
  weight: String(l.weight), evidenceRequired: l.evidenceRequired, autoMetric: l.autoMetric ?? "",
  bands: { "5": "", "4": "", "3": "", "2": "", "1": "", ...l.bands },
});

function TemplateEditor({ cycleId, template, canEdit, onSaved }: {
  cycleId: string; template: Template; canEdit: boolean; onSaved: (c: Config) => void;
}) {
  const [name, setName] = useState(template.displayName);
  const [lines, setLines] = useState<LineDraft[]>(template.lines.map(toLineDraft));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    setName(template.displayName);
    setLines(template.lines.map(toLineDraft));
    setDirty(false);
    setOpen(null);
  }, [template]);

  const edit = (fn: (l: LineDraft[]) => LineDraft[]) => { setLines(fn); setDirty(true); setDone(false); };
  const patch = (i: number, p: Partial<LineDraft>) => edit((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const move = (i: number, d: number) => edit((ls) => {
    const j = i + d; if (j < 0 || j >= ls.length) return ls;
    const c = [...ls]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  const total = round2(lines.reduce((s, l) => s + (Number(l.weight) || 0), 0));
  let problem: string | null = null;
  if (!name.trim()) problem = "Role title is required";
  else if (lines.some((l) => !l.name.trim())) problem = "Every line needs a name";
  else if (lines.some((l) => !(Number(l.weight) > 0))) problem = "Every weight must be above 0";
  else if (lines.some((l) => ["1", "2", "3", "4", "5"].some((k) => !l.bands[k]?.trim()))) problem = "Describe all five ratings on every line";
  else if (total !== 100) problem = `Weights add up to ${total}%, they must add up to exactly 100%`;

  async function save() {
    setSaving(true); setError(null);
    try {
      const body = {
        displayName: name.trim(),
        lines: lines.map((l) => ({
          ...(l.id ? { id: l.id } : {}),
          name: l.name.trim(), measurement: l.measurement.trim() || null, target: l.target.trim() || null,
          explanation: l.explanation.trim() || null, weight: Number(l.weight), evidenceRequired: l.evidenceRequired,
          autoMetric: l.autoMetric || null, bands: l.bands,
        })),
      };
      onSaved(await apiPut<Config>(`/api/kpi/config/${cycleId}/templates/${template.id}`, body));
      setDirty(false); setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); } finally { setSaving(false); }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-end gap-4 border-b border-gray-200 px-5 py-4">
        <label className="min-w-[260px] flex-1 text-xs text-gray-500">
          Role title on the form
          <input value={name} disabled={!canEdit} onChange={(e) => { setName(e.target.value); setDirty(true); setDone(false); }} className={`${input} mt-1`} />
        </label>
        <div className={`rounded-lg px-4 py-2 text-center ${total === 100 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          <div className="text-2xl font-semibold leading-none">{total}%</div>
          <div className="text-[11px]">total weight (must be 100%)</div>
        </div>
      </div>

      <ul className="divide-y divide-gray-100">
        {lines.map((l, i) => (
          <li key={l.id ?? `new-${i}`} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-sm text-gray-400">{i + 1}</span>
              <input value={l.name} disabled={!canEdit} onChange={(e) => patch(i, { name: e.target.value })} placeholder="KPI / KRA line name" className={`${input} min-w-[240px] flex-1`} />
              <label className="flex items-center gap-1 text-xs text-gray-500">
                Weight
                <input type="number" min={0} max={100} step={0.5} value={l.weight} disabled={!canEdit} onChange={(e) => patch(i, { weight: e.target.value })} className={`${input} w-20`} />%
              </label>
              <button onClick={() => setOpen(open === i ? null : i)} className={btn}>{open === i ? "Hide details" : "Details & ratings"}</button>
              {canEdit && (
                <>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className={btn} aria-label="Move up">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === lines.length - 1} className={btn} aria-label="Move down">↓</button>
                  <button onClick={() => edit((ls) => ls.filter((_, k) => k !== i))} className={`${btn} text-red-600`}>Remove</button>
                </>
              )}
            </div>
            {open === i && (
              <div className="mt-3 grid gap-3 pl-8 md:grid-cols-2">
                <label className="text-xs text-gray-500">Target
                  <input value={l.target} disabled={!canEdit} onChange={(e) => patch(i, { target: e.target.value })} className={`${input} mt-1`} />
                </label>
                <label className="text-xs text-gray-500">Suggested rating from CSIDOP data (optional)
                  <select value={l.autoMetric} disabled={!canEdit} onChange={(e) => patch(i, { autoMetric: e.target.value })} className={`${input} mt-1`}>
                    <option value="">None</option>
                    {KPI_METRICS.map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500 md:col-span-2">What is measured
                  <textarea rows={2} value={l.measurement} disabled={!canEdit} onChange={(e) => patch(i, { measurement: e.target.value })} className={`${input} mt-1`} />
                </label>
                <label className="text-xs text-gray-500 md:col-span-2">Plain-language explanation for staff
                  <textarea rows={2} value={l.explanation} disabled={!canEdit} onChange={(e) => patch(i, { explanation: e.target.value })} className={`${input} mt-1`} />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
                  <input type="checkbox" checked={l.evidenceRequired} disabled={!canEdit} onChange={(e) => patch(i, { evidenceRequired: e.target.checked })} />
                  A rating above 3 needs supporting evidence
                </label>
                <div className="space-y-1 md:col-span-2">
                  <div className="text-xs text-gray-500">What each rating means</div>
                  {["5", "4", "3", "2", "1"].map((r) => (
                    <div key={r} className="flex items-center gap-2">
                      <span className="w-5 text-center text-sm font-medium text-gray-600">{r}</span>
                      <input value={l.bands[r] ?? ""} disabled={!canEdit} onChange={(e) => patch(i, { bands: { ...l.bands, [r]: e.target.value } })} className={input} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="border-t border-gray-100 px-5 py-3">
          <button
            onClick={() => { edit((ls) => [...ls, { name: "", measurement: "", target: "", explanation: "", weight: "", evidenceRequired: true, autoMetric: "", bands: { "5": "", "4": "", "3": "", "2": "", "1": "" } }]); setOpen(lines.length); }}
            className={btn}
          >
            + Add a line
          </button>
        </div>
      )}
      {canEdit && <SaveBar problem={problem} dirty={dirty} saving={saving} error={error} onSave={save} done={done} />}
    </div>
  );
}

// ── HR value + bonus items ──────────────────────────────────────────────────

interface ItemDraft {
  id?: string; section: "Value" | "Bonus"; name: string; description: string; weight: string;
  scaleMax: string; inputMode: "Rating" | "Certificates"; bands: string;
}

const bandsToText = (b: Record<string, string>) => Object.entries(b).map(([k, v]) => `${k}: ${v}`).join("\n");
function textToBands(t: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of t.split("\n")) {
    const m = row.match(/^\s*([^:]+?)\s*:\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function ItemsEditor({ cycleId, items, canEdit, onSaved }: { cycleId: string; items: Item[]; canEdit: boolean; onSaved: (c: Config) => void }) {
  const toDraft = (i: Item): ItemDraft => ({
    id: i.id, section: i.section, name: i.name, description: i.description ?? "", weight: String(i.weight),
    scaleMax: String(i.scaleMax), inputMode: i.inputMode, bands: bandsToText(i.bands),
  });
  const [rows, setRows] = useState<ItemDraft[]>(items.map(toDraft));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => { setRows(items.map(toDraft)); setDirty(false); setOpen(null); }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (fn: (r: ItemDraft[]) => ItemDraft[]) => { setRows(fn); setDirty(true); setDone(false); };
  const patch = (i: number, p: Partial<ItemDraft>) => edit((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const sum = (section: string) => round2(rows.filter((r) => r.section === section).reduce((s, r) => s + (Number(r.weight) || 0), 0));
  const valueTotal = sum("Value");

  let problem: string | null = null;
  if (rows.some((r) => !r.name.trim())) problem = "Every item needs a name";
  else if (rows.some((r) => !(Number(r.weight) > 0))) problem = "Every weight must be above 0";
  else if (rows.some((r) => !Number.isInteger(Number(r.scaleMax)) || Number(r.scaleMax) < 2 || Number(r.scaleMax) > 10)) problem = "Highest score must be a whole number from 2 to 10";
  else if (rows.filter((r) => r.inputMode === "Certificates").length > 1) problem = "Only one item can use the certification points table";
  else if (valueTotal !== 100) problem = `HR item weights add up to ${valueTotal}%, they must add up to exactly 100%`;

  async function save() {
    setSaving(true); setError(null);
    try {
      const body = {
        items: rows.map((r) => ({
          ...(r.id ? { id: r.id } : {}), section: r.section, name: r.name.trim(), description: r.description.trim() || null,
          weight: Number(r.weight), scaleMax: Number(r.scaleMax), inputMode: r.inputMode, bands: textToBands(r.bands),
        })),
      };
      onSaved(await apiPut<Config>(`/api/kpi/config/${cycleId}/items`, body));
      setDirty(false); setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); } finally { setSaving(false); }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap gap-3 border-b border-gray-200 px-5 py-4 text-sm">
        <span className={`rounded-lg px-3 py-1 ${valueTotal === 100 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>HR items: {valueTotal}% (must be 100%)</span>
        <span className="rounded-lg bg-gray-50 px-3 py-1 text-gray-600">Bonus items: {sum("Bonus")}% of weight</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-sm text-gray-400">{i + 1}</span>
              <select value={r.section} disabled={!canEdit} onChange={(e) => patch(i, { section: e.target.value as "Value" | "Bonus" })} className={`${input} w-28`}>
                <option value="Value">HR item</option><option value="Bonus">Bonus</option>
              </select>
              <input value={r.name} disabled={!canEdit} onChange={(e) => patch(i, { name: e.target.value })} className={`${input} min-w-[240px] flex-1`} />
              <label className="flex items-center gap-1 text-xs text-gray-500">Weight
                <input type="number" min={0} max={100} step={0.5} value={r.weight} disabled={!canEdit} onChange={(e) => patch(i, { weight: e.target.value })} className={`${input} w-20`} />%
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-500">Highest score
                <input type="number" min={2} max={10} value={r.scaleMax} disabled={!canEdit} onChange={(e) => patch(i, { scaleMax: e.target.value })} className={`${input} w-16`} />
              </label>
              <button onClick={() => setOpen(open === i ? null : i)} className={btn}>{open === i ? "Hide details" : "Details"}</button>
              {canEdit && <button onClick={() => edit((rs) => rs.filter((_, k) => k !== i))} className={`${btn} text-red-600`}>Remove</button>}
            </div>
            {open === i && (
              <div className="mt-3 grid gap-3 pl-8">
                <label className="text-xs text-gray-500">What this item looks at
                  <input value={r.description} disabled={!canEdit} onChange={(e) => patch(i, { description: e.target.value })} className={`${input} mt-1`} />
                </label>
                <label className="text-xs text-gray-500">How the score is entered
                  <select value={r.inputMode} disabled={!canEdit} onChange={(e) => patch(i, { inputMode: e.target.value as "Rating" | "Certificates" })} className={`${input} mt-1`}>
                    <option value="Rating">Score given by the reviewer</option>
                    <option value="Certificates">Calculated from the certification points table</option>
                  </select>
                </label>
                <label className="text-xs text-gray-500">What each score means (one per line, like “7-8: Strong job knowledge”)
                  <textarea rows={6} value={r.bands} disabled={!canEdit} onChange={(e) => patch(i, { bands: e.target.value })} className={`${input} mt-1 font-mono`} />
                </label>
              </div>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="border-t border-gray-100 px-5 py-3">
          <button onClick={() => { edit((rs) => [...rs, { section: "Value", name: "", description: "", weight: "", scaleMax: "5", inputMode: "Rating", bands: "" }]); setOpen(rows.length); }} className={btn}>+ Add an item</button>
        </div>
      )}
      {canEdit && <SaveBar problem={problem} dirty={dirty} saving={saving} error={error} onSave={save} done={done} />}
    </div>
  );
}

// ── Score outcomes ──────────────────────────────────────────────────────────

function OutcomesEditor({ cycleId, bands, canEdit, onSaved }: { cycleId: string; bands: Config["outcomeBands"]; canEdit: boolean; onSaved: (c: Config) => void }) {
  const toRows = (b: Config["outcomeBands"]) => b.map((x) => ({ minScore: String(x.minScore), outcome: x.outcome }));
  const [rows, setRows] = useState(toRows(bands));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => { setRows(toRows(bands)); setDirty(false); }, [bands]);

  const edit = (fn: (r: typeof rows) => typeof rows) => { setRows(fn); setDirty(true); setDone(false); };
  const mins = rows.map((r) => Number(r.minScore));
  let problem: string | null = null;
  if (rows.some((r) => r.minScore.trim() === "" || !Number.isFinite(Number(r.minScore)) || Number(r.minScore) < 0 || Number(r.minScore) > 120)) problem = "Each band needs a start score from 0 to 120";
  else if (rows.some((r) => !r.outcome.trim())) problem = "Each band needs an outcome";
  else if (new Set(mins).size !== mins.length) problem = "Two bands start at the same score";
  else if (!mins.includes(0)) problem = "One band must start at 0 so every score has an outcome";

  async function save() {
    setSaving(true); setError(null);
    try {
      onSaved(await apiPut<Config>(`/api/kpi/config/${cycleId}/outcomes`, { bands: rows.map((r) => ({ minScore: Number(r.minScore), outcome: r.outcome.trim() })) }));
      setDirty(false); setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); } finally { setSaving(false); }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <p className="border-b border-gray-200 px-5 py-3 text-xs text-gray-500">
        A total score at or above the start score (and below the next band) gets that outcome. The maximum total is 120.
      </p>
      <ul className="divide-y divide-gray-100">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 px-5 py-3">
            <label className="flex items-center gap-1 text-xs text-gray-500">From
              <input type="number" min={0} max={120} step={0.5} value={r.minScore} disabled={!canEdit} onChange={(e) => edit((rs) => rs.map((x, k) => (k === i ? { ...x, minScore: e.target.value } : x)))} className={`${input} w-20`} />
            </label>
            <input value={r.outcome} disabled={!canEdit} onChange={(e) => edit((rs) => rs.map((x, k) => (k === i ? { ...x, outcome: e.target.value } : x)))} className={`${input} min-w-[260px] flex-1`} />
            {canEdit && <button onClick={() => edit((rs) => rs.filter((_, k) => k !== i))} className={`${btn} text-red-600`}>Remove</button>}
          </li>
        ))}
      </ul>
      {canEdit && <div className="border-t border-gray-100 px-5 py-3"><button onClick={() => edit((rs) => [...rs, { minScore: "", outcome: "" }])} className={btn}>+ Add a band</button></div>}
      {canEdit && <SaveBar problem={problem} dirty={dirty} saving={saving} error={error} onSave={save} done={done} />}
    </div>
  );
}

// ── Certification points + cycle settings ───────────────────────────────────

function CycleEditor({ config, canEdit, onSaved }: { config: Config; canEdit: boolean; onSaved: (c: Config) => void }) {
  const cert = config.cycle.config.certificates ?? { categories: [], scoreCap: 10 };
  const toRows = () => cert.categories.map((c) => ({ code: c.code, points: String(c.points), maxTotal: c.maxTotal === undefined ? "" : String(c.maxTotal), minCount: c.minCount === undefined ? "" : String(c.minCount) }));
  const [rows, setRows] = useState(toRows());
  const [cap, setCap] = useState(String(cert.scoreCap));
  const [name, setName] = useState(config.cycle.name);
  const [status, setStatus] = useState(config.cycle.status);
  const [emails, setEmails] = useState((config.cycle.config.hrEmails ?? []).join("\n"));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => { setRows(toRows()); setCap(String(cert.scoreCap)); setName(config.cycle.name); setStatus(config.cycle.status); setEmails((config.cycle.config.hrEmails ?? []).join("\n")); setDirty(false); }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  const touch = () => { setDirty(true); setDone(false); };
  const emailList = emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const badEmail = emailList.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  let problem: string | null = null;
  if (!name.trim()) problem = "Cycle name is required";
  else if (badEmail) problem = `“${badEmail}” is not a valid email address`;
  else if (emailList.length > 10) problem = "At most 10 HR email addresses";
  else if (rows.length === 0) problem = "Add at least one certification category";
  else if (rows.some((r) => !r.code.trim() || !(Number(r.points) > 0))) problem = "Each category needs a name and points above 0";
  else if (!Number.isInteger(Number(cap)) || Number(cap) < 1 || Number(cap) > 10) problem = "Highest item score must be a whole number from 1 to 10";

  async function save() {
    setSaving(true); setError(null);
    try {
      const body = {
        name: name.trim(), status, hrEmails: emailList,
        certificates: {
          categories: rows.map((r) => ({
            code: r.code.trim(), points: Number(r.points),
            ...(r.maxTotal.trim() ? { maxTotal: Number(r.maxTotal) } : {}),
            ...(r.minCount.trim() ? { minCount: Number(r.minCount) } : {}),
          })),
          scoreCap: Number(cap),
        },
      };
      onSaved(await apiPatch<Config>(`/api/kpi/config/${config.cycle.id}`, body));
      setDirty(false); setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); } finally { setSaving(false); }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="grid gap-4 border-b border-gray-200 px-5 py-4 md:grid-cols-2">
        <label className="text-xs text-gray-500">Cycle name
          <input value={name} disabled={!canEdit} onChange={(e) => { setName(e.target.value); touch(); }} className={`${input} mt-1`} />
        </label>
        <label className="text-xs text-gray-500">Status
          <select value={status} disabled={!canEdit} onChange={(e) => { setStatus(e.target.value as Cycle["status"]); touch(); }} className={`${input} mt-1`}>
            <option value="Draft">Draft (being set up)</option><option value="Open">Open (appraisals running)</option><option value="Closed">Closed</option>
          </select>
        </label>
      </div>
      <div className="border-b border-gray-200 px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-800">HR email addresses</h3>
        <p className="mb-2 text-xs text-gray-500">
          Where the final results go when the HOD presses “Send to HR”. One address per line. Leave empty to switch sending off.
        </p>
        <textarea rows={3} value={emails} disabled={!canEdit} onChange={(e) => { setEmails(e.target.value); touch(); }} className={`${input} font-mono`} placeholder="hr@company.com" />
      </div>
      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold text-gray-800">Employee Certifications: points table</h3>
        <p className="mb-3 text-xs text-gray-500">
          Points per certificate, a cap per category, and how many certificates of a category are needed before any score is given.
          The total points become the item score, up to the highest score below.
        </p>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-2">Category</th><th className="pr-2">Points each</th><th className="pr-2">Max points</th><th className="pr-2">Minimum needed</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><input value={r.code} disabled={!canEdit} onChange={(e) => { setRows((rs) => rs.map((x, k) => (k === i ? { ...x, code: e.target.value } : x))); touch(); }} className={input} /></td>
                <td className="pr-2"><input type="number" min={0} value={r.points} disabled={!canEdit} onChange={(e) => { setRows((rs) => rs.map((x, k) => (k === i ? { ...x, points: e.target.value } : x))); touch(); }} className={`${input} w-24`} /></td>
                <td className="pr-2"><input type="number" min={0} value={r.maxTotal} placeholder="no cap" disabled={!canEdit} onChange={(e) => { setRows((rs) => rs.map((x, k) => (k === i ? { ...x, maxTotal: e.target.value } : x))); touch(); }} className={`${input} w-24`} /></td>
                <td className="pr-2"><input type="number" min={0} value={r.minCount} placeholder="none" disabled={!canEdit} onChange={(e) => { setRows((rs) => rs.map((x, k) => (k === i ? { ...x, minCount: e.target.value } : x))); touch(); }} className={`${input} w-24`} /></td>
                <td>{canEdit && <button onClick={() => { setRows((rs) => rs.filter((_, k) => k !== i)); touch(); }} className={`${btn} text-red-600`}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && <button onClick={() => { setRows((rs) => [...rs, { code: "", points: "", maxTotal: "", minCount: "" }]); touch(); }} className={`${btn} mt-2`}>+ Add a category</button>}
        <label className="mt-4 block text-xs text-gray-500">Highest item score the points convert to
          <input type="number" min={1} max={10} value={cap} disabled={!canEdit} onChange={(e) => { setCap(e.target.value); touch(); }} className={`${input} mt-1 w-24`} />
        </label>
      </div>
      {canEdit && <SaveBar problem={problem} dirty={dirty} saving={saving} error={error} onSave={save} done={done} />}
    </div>
  );
}

// ── Page body ───────────────────────────────────────────────────────────────

const TABS = [
  { key: "templates", label: "Role templates" },
  { key: "items", label: "HR & bonus items" },
  { key: "outcomes", label: "Score outcomes" },
  { key: "cycle", label: "Cycle & certifications" },
  { key: "reporting", label: "Reporting lines" },
] as const;

export default function KpiSetup({ canEdit }: { canEdit: boolean }) {
  const { data: cycles, error: cyclesError } = useSWR<Cycle[]>("/api/kpi/config", apiFetcher);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("templates");
  const [roleCode, setRoleCode] = useState<string | null>(null);

  const activeId = cycleId ?? cycles?.[0]?.id ?? null;
  const { data: config, error, mutate } = useSWR<Config>(activeId ? `/api/kpi/config/${activeId}` : null, apiFetcher);

  if (cyclesError) return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{cyclesError.message}</div>;
  if (!cycles) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;
  if (cycles.length === 0) return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">No KPI cycle has been set up yet.</div>;
  if (error) return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>;
  if (!config) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;

  const saved = (c: Config) => { void mutate(c, false); };
  const template = config.templates.find((t) => t.roleCode === roleCode) ?? config.templates[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={activeId ?? ""} onChange={(e) => setCycleId(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
          {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{config.cycle.status}</span>
        <span className="text-xs text-gray-500">{config.cycle.periodStart} to {config.cycle.periodEnd}</span>
        {!canEdit && <span className="text-xs text-gray-500">View only. Only the HOD can change the setup.</span>}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm ${tab === t.key ? "border-b-2 border-primary-600 font-medium text-primary-700" : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "templates" && template && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {config.templates.map((t) => (
              <button key={t.id} onClick={() => setRoleCode(t.roleCode)}
                className={`rounded-full border px-3 py-1 text-sm ${t.id === template.id ? "border-primary-600 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                {t.displayName}
              </button>
            ))}
          </div>
          <TemplateEditor cycleId={config.cycle.id} template={template} canEdit={canEdit} onSaved={saved} />
        </div>
      )}
      {tab === "items" && <ItemsEditor cycleId={config.cycle.id} items={config.items} canEdit={canEdit} onSaved={saved} />}
      {tab === "outcomes" && <OutcomesEditor cycleId={config.cycle.id} bands={config.outcomeBands} canEdit={canEdit} onSaved={saved} />}
      {tab === "cycle" && <CycleEditor config={config} canEdit={canEdit} onSaved={saved} />}
      {tab === "reporting" && <KpiReportingLines canEdit={canEdit} />}
    </div>
  );
}
