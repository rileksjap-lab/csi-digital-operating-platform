"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import { btnCls, dangerCls, inputCls, primaryCls, type LeaveType } from "@/components/leave/shared";

interface Config {
  year: number;
  types: LeaveType[];
  rules: { id: string; leaveTypeId: string; minYears: number; days: number }[];
  holidays: { id: string; date: string; name: string }[];
  people: { id: string; name: string; joinDate: string | null }[];
  balances: { staffId: string; leaveTypeId: string; entitled: number; carriedForward: number; adjustment: number; note: string | null }[];
  approverCandidates: { id: string; name: string }[];
  actingApprover: { staffId: string; from: string; to: string } | null;
}

const card = "rounded-lg border border-gray-200 bg-white p-4";
const h2 = "text-sm font-semibold text-gray-800";

export default function LeaveSetup() {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, mutate } = useSWR<Config>(`/api/leave/config?year=${year}`, apiFetcher);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function op(body: Record<string, unknown>, okText?: string): Promise<boolean> {
    setBusy(true); setMsg(null);
    try {
      const r = await apiPost<Record<string, unknown>>("/api/leave/config", body);
      await mutate();
      setMsg({ kind: "ok", text: okText ?? (typeof r?.created === "number" ? `Created ${r.created} balance row(s).` : "Saved.") });
      setBusy(false);
      return true;
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Could not save" });
      setBusy(false);
      return false;
    }
  }

  if (!data) return <p className="text-sm text-gray-400">Loading…</p>;
  const tracked = data.types.filter((t) => t.trackBalance && t.active);

  return (
    <div className="space-y-5">
      {msg && <div className={`rounded px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{msg.text}</div>}

      <TypesSection types={data.types} busy={busy} op={op} />
      <RulesSection tracked={tracked} rules={data.rules} busy={busy} op={op} />
      <BalancesSection data={data} tracked={tracked} year={year} setYear={setYear} busy={busy} op={op} />
      <HolidaysSection data={data} year={year} busy={busy} op={op} />
      <ApproverSection data={data} busy={busy} op={op} />
    </div>
  );
}

type OpFn = (body: Record<string, unknown>, okText?: string) => Promise<boolean>;

// ── Leave types ─────────────────────────────────────────────────────────────

function TypeRow({ t, busy, op }: { t: LeaveType; busy: boolean; op: OpFn }) {
  const [v, setV] = useState(t);
  useEffect(() => setV(t), [t]);
  const dirty = JSON.stringify(v) !== JSON.stringify(t);
  return (
    <tr className="border-t border-gray-100">
      <td className="px-2 py-1.5 text-xs text-gray-400">{t.code}</td>
      <td className="px-2 py-1.5"><input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className={inputCls} /></td>
      <td className="px-2 py-1.5"><input type="color" value={v.colour} onChange={(e) => setV({ ...v, colour: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-gray-300" /></td>
      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={v.trackBalance} onChange={(e) => setV({ ...v, trackBalance: e.target.checked })} aria-label={`${t.name} keeps a balance`} /></td>
      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={v.halfDayAllowed} onChange={(e) => setV({ ...v, halfDayAllowed: e.target.checked })} aria-label={`${t.name} allows half days`} /></td>
      <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} aria-label={`${t.name} is in use`} /></td>
      <td className="px-2 py-1.5 text-right"><button className={btnCls} disabled={busy || !dirty || !v.name.trim()} onClick={() => op({ op: "type.save", id: t.id, name: v.name, colour: v.colour, trackBalance: v.trackBalance, halfDayAllowed: v.halfDayAllowed, active: v.active })}>Save</button></td>
    </tr>
  );
}

function TypesSection({ types, busy, op }: { types: LeaveType[]; busy: boolean; op: OpFn }) {
  const [code, setCode] = useState(""); const [name, setName] = useState("");
  return (
    <section className={card}>
      <h2 className={h2}>Leave types</h2>
      <p className="text-xs text-gray-500">Switch a type off to hide it from the Apply form. Old requests keep their type. &ldquo;Keeps a balance&rdquo; types get an entitlement per person.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500"><tr><th className="px-2 py-1">Code</th><th className="px-2 py-1">Name</th><th className="px-2 py-1">Colour</th><th className="px-2 py-1 text-center">Keeps a balance</th><th className="px-2 py-1 text-center">Half days</th><th className="px-2 py-1 text-center">In use</th><th /></tr></thead>
          <tbody>{types.map((t) => <TypeRow key={t.id} t={t} busy={busy} op={op} />)}</tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
        <label className="text-xs text-gray-500">New code<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. HAJJ" className={`${inputCls} mt-1 w-32`} /></label>
        <label className="text-xs text-gray-500">Name<input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1 w-56`} /></label>
        <button className={btnCls} disabled={busy || !code || !name.trim()}
          onClick={async () => { if (await op({ op: "type.save", code, name, colour: "#0d9488", trackBalance: false, halfDayAllowed: true, active: true })) { setCode(""); setName(""); } }}>Add leave type</button>
      </div>
    </section>
  );
}

// ── Entitlement rules ───────────────────────────────────────────────────────

function RulesSection({ tracked, rules, busy, op }: { tracked: LeaveType[]; rules: Config["rules"]; busy: boolean; op: OpFn }) {
  const [draft, setDraft] = useState<Record<string, { minYears: string; days: string }>>({});
  return (
    <section className={card}>
      <h2 className={h2}>Entitlement by years of service</h2>
      <p className="text-xs text-gray-500">For each type that keeps a balance, say how many days a year a person gets from a number of years of service. The highest tier a person has reached applies. Example: from 0 years, 8 days; from 2 years, 12 days.</p>
      {tracked.length === 0 && <p className="mt-2 text-sm text-gray-500">No type keeps a balance. Tick &ldquo;Keeps a balance&rdquo; above first.</p>}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {tracked.map((t) => {
          const mine = rules.filter((r) => r.leaveTypeId === t.id);
          const d = draft[t.id] ?? { minYears: "", days: "" };
          return (
            <div key={t.id} className="rounded border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-800"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.colour }} />{t.name}</p>
              {mine.length === 0 ? <p className="mt-1 text-xs text-gray-400">No tiers yet. People start with 0 days unless you set them below.</p> : (
                <ul className="mt-1 space-y-1 text-sm">
                  {mine.map((r) => (
                    <li key={r.id} className="flex items-center justify-between">
                      <span>From {r.minYears} year{r.minYears === 1 ? "" : "s"}: <span className="font-medium">{r.days} days</span></span>
                      <button className="text-xs text-red-600 hover:underline" disabled={busy} onClick={() => op({ op: "rule.delete", id: r.id })}>Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex items-end gap-2">
                <label className="text-xs text-gray-500">From (years)<input type="number" min={0} step={0.5} value={d.minYears} onChange={(e) => setDraft({ ...draft, [t.id]: { ...d, minYears: e.target.value } })} className={`${inputCls} mt-1 w-24`} /></label>
                <label className="text-xs text-gray-500">Days a year<input type="number" min={0} step={0.5} value={d.days} onChange={(e) => setDraft({ ...draft, [t.id]: { ...d, days: e.target.value } })} className={`${inputCls} mt-1 w-24`} /></label>
                <button className={btnCls} disabled={busy || d.minYears === "" || d.days === ""}
                  onClick={async () => { if (await op({ op: "rule.set", leaveTypeId: t.id, minYears: Number(d.minYears), days: Number(d.days) })) setDraft({ ...draft, [t.id]: { minYears: "", days: "" } }); }}>Add / update</button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Balances and join dates ─────────────────────────────────────────────────

function PersonRow({ p, typeId, year, bal, busy, op }: { p: Config["people"][number]; typeId: string; year: number; bal?: Config["balances"][number]; busy: boolean; op: OpFn }) {
  const [join, setJoin] = useState(p.joinDate ?? "");
  const [e, setE] = useState(String(bal?.entitled ?? 0));
  const [c, setC] = useState(String(bal?.carriedForward ?? 0));
  const [a, setA] = useState(String(bal?.adjustment ?? 0));
  useEffect(() => { setJoin(p.joinDate ?? ""); }, [p.joinDate]);
  useEffect(() => { setE(String(bal?.entitled ?? 0)); setC(String(bal?.carriedForward ?? 0)); setA(String(bal?.adjustment ?? 0)); }, [bal, typeId, year]);
  const num = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? 0 : Number(s));
  return (
    <tr className="border-t border-gray-100">
      <td className="px-2 py-1.5 text-gray-800">{p.name}</td>
      <td className="px-2 py-1.5"><input type="date" value={join} onChange={(ev) => setJoin(ev.target.value)} onBlur={() => { if (join !== (p.joinDate ?? "")) void op({ op: "joindate.set", staffId: p.id, joinDate: join || null }); }} className={`${inputCls} w-40`} /></td>
      <td className="px-2 py-1.5"><input type="number" step={0.5} value={e} onChange={(ev) => setE(ev.target.value)} className={`${inputCls} w-20`} /></td>
      <td className="px-2 py-1.5"><input type="number" step={0.5} value={c} onChange={(ev) => setC(ev.target.value)} className={`${inputCls} w-20`} /></td>
      <td className="px-2 py-1.5"><input type="number" step={0.5} value={a} onChange={(ev) => setA(ev.target.value)} className={`${inputCls} w-20`} /></td>
      <td className="px-2 py-1.5 text-right">
        <button className={btnCls} disabled={busy} onClick={() => op({ op: "balance.save", staffId: p.id, leaveTypeId: typeId, year, entitled: num(e), carriedForward: num(c), adjustment: num(a) })}>Save</button>
        {!bal && <span className="ml-2 text-xs text-amber-600">not set</span>}
      </td>
    </tr>
  );
}

function BalancesSection({ data, tracked, year, setYear, busy, op }: { data: Config; tracked: LeaveType[]; year: number; setYear: (y: number) => void; busy: boolean; op: OpFn }) {
  const [typeId, setTypeId] = useState("");
  const current = typeId && tracked.some((t) => t.id === typeId) ? typeId : tracked[0]?.id ?? "";
  return (
    <section className={card}>
      <h2 className={h2}>Balances and join dates</h2>
      <p className="text-xs text-gray-500">&ldquo;Create missing balances&rdquo; fills each person&apos;s entitlement for the year from the tiers above and their join date. It never overwrites a figure you have already entered. Then adjust anyone by hand.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <button className={btnCls} onClick={() => setYear(year - 1)} aria-label="Previous year">←</button>
          <span className="w-14 text-center text-sm font-semibold">{year}</span>
          <button className={btnCls} onClick={() => setYear(year + 1)} aria-label="Next year">→</button>
        </div>
        <label className="text-xs text-gray-500">Leave type
          <select value={current} onChange={(e) => setTypeId(e.target.value)} className={`${inputCls} mt-1 w-56`}>{tracked.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </label>
        <button className={primaryCls} disabled={busy || tracked.length === 0} onClick={() => op({ op: "balance.generate", year })}>Create missing balances for {year}</button>
      </div>
      {current && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500"><tr><th className="px-2 py-1">Person</th><th className="px-2 py-1">Joined</th><th className="px-2 py-1">Entitled</th><th className="px-2 py-1">Brought forward</th><th className="px-2 py-1">Adjustment</th><th /></tr></thead>
            <tbody>
              {data.people.map((p) => <PersonRow key={p.id} p={p} typeId={current} year={year} bal={data.balances.find((b) => b.staffId === p.id && b.leaveTypeId === current)} busy={busy} op={op} />)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Public holidays ─────────────────────────────────────────────────────────

function HolidaysSection({ data, year, busy, op }: { data: Config; year: number; busy: boolean; op: OpFn }) {
  const [date, setDate] = useState(""); const [name, setName] = useState("");
  return (
    <section className={card}>
      <h2 className={h2}>Public holidays, {year}</h2>
      <p className="text-xs text-gray-500">These days (and Saturdays and Sundays) are not counted as leave. Add the holidays for the year, including any replacement or state holiday that applies to you.</p>
      {data.holidays.length === 0 ? <p className="mt-2 text-sm text-gray-400">No holidays entered for {year}.</p> : (
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {data.holidays.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-1.5"><span><span className="inline-block w-24 text-gray-500">{h.date}</span>{h.name}</span>
              <button className="text-xs text-red-600 hover:underline" disabled={busy} onClick={() => op({ op: "holiday.delete", id: h.id })}>Remove</button></li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
        <label className="text-xs text-gray-500">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} mt-1 w-40`} /></label>
        <label className="text-xs text-gray-500">Name<input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1 w-64`} /></label>
        <button className={btnCls} disabled={busy || !date || !name.trim()} onClick={async () => { if (await op({ op: "holiday.add", date, name })) { setDate(""); setName(""); } }}>Add holiday</button>
      </div>
    </section>
  );
}

// ── Approver cover ──────────────────────────────────────────────────────────

function ApproverSection({ data, busy, op }: { data: Config; busy: boolean; op: OpFn }) {
  const a = data.actingApprover;
  const [staffId, setStaffId] = useState(a?.staffId ?? "");
  const [from, setFrom] = useState(a?.from ?? "");
  const [to, setTo] = useState(a?.to ?? "");
  useEffect(() => { setStaffId(a?.staffId ?? ""); setFrom(a?.from ?? ""); setTo(a?.to ?? ""); }, [a]);
  return (
    <section className={card}>
      <h2 className={h2}>Approving while you are away</h2>
      <p className="text-xs text-gray-500">Name a Solution Manager to give the HOD&apos;s approval on leave requests between two dates. They cannot approve their own, and it is recorded as &ldquo;Acting for the HOD&rdquo;.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-500">Solution Manager
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={`${inputCls} mt-1 w-56`}>
            <option value="">No cover</option>{data.approverCandidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1 w-40`} /></label>
        <label className="text-xs text-gray-500">Until<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputCls} mt-1 w-40`} /></label>
        <button className={primaryCls} disabled={busy || (!!staffId && (!from || !to))} onClick={() => op({ op: "approver.set", staffId: staffId || null, from: from || undefined, to: to || undefined })}>{staffId ? "Save cover" : "Clear cover"}</button>
        {a && <button className={dangerCls} disabled={busy} onClick={() => op({ op: "approver.set", staffId: null })}>Remove cover</button>}
      </div>
    </section>
  );
}
