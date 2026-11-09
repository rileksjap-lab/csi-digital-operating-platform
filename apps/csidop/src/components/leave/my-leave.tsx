"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import type { DayPart } from "@/lib/leave/rules";
import {
  btnCls, dangerCls, fmtDays, fmtRange, inputCls, primaryCls, STATUS_LABEL, STATUS_TONE,
  type BalanceRow, type LeaveRow, type Meta,
} from "@/components/leave/shared";

const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function ApplyForm({ meta, onDone, onCancel }: { meta: Meta; onDone: (msg: string) => void; onCancel: () => void }) {
  const [typeId, setTypeId] = useState(meta.types[0]?.id ?? "");
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [part, setPart] = useState<DayPart>("Full");
  const [reason, setReason] = useState("");
  const [cover, setCover] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = meta.types.find((t) => t.id === typeId);
  const single = start === end;
  const halfOk = single && !!type?.halfDayAllowed;

  async function submit() {
    setBusy(true); setError(null);
    try {
      const r = await apiPost<{ days: number; status: string; balanceAfter: number | null }>("/api/leave/requests", {
        leaveTypeId: typeId, startDate: start, endDate: end, dayPart: halfOk ? part : "Full",
        reason: reason.trim() || null, coverStaffId: cover || null,
      });
      const next = r.status === "Approved" ? "It is recorded as approved." : "It has gone for approval.";
      onDone(`Requested ${fmtDays(r.days)} of ${type?.name ?? "leave"}. ${next}${r.balanceAfter !== null ? ` Balance after this: ${r.balanceAfter}.` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit");
    }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border border-primary-200 bg-primary-50/30 p-4">
      <h3 className="text-sm font-semibold text-gray-800">Apply for leave</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <label className="text-xs text-gray-500 md:col-span-2">Leave type
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={`${inputCls} mt-1`}>
            {meta.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500">From
          <input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} className={`${inputCls} mt-1`} />
        </label>
        <label className="text-xs text-gray-500">Until
          <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        {halfOk && (
          <label className="text-xs text-gray-500">Length
            <select value={part} onChange={(e) => setPart(e.target.value as DayPart)} className={`${inputCls} mt-1`}>
              <option value="Full">Full day</option><option value="AM">Morning only</option><option value="PM">Afternoon only</option>
            </select>
          </label>
        )}
        <label className="text-xs text-gray-500 md:col-span-2">Who covers for you? (optional)
          <select value={cover} onChange={(e) => setCover(e.target.value)} className={`${inputCls} mt-1`}>
            <option value="">No one named</option>
            {meta.colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-500 md:col-span-4">Reason (everyone in the team can see this)
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>
      <p className="mt-2 text-xs text-gray-500">Weekends and public holidays are not counted.</p>
      {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={submit} disabled={busy || !typeId} className={primaryCls}>Submit request</button>
        <button onClick={onCancel} disabled={busy} className={btnCls}>Close</button>
      </div>
    </div>
  );
}

export default function MyLeave({ meta }: { meta: Meta }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: bal, mutate: mutateBal } = useSWR<{ year: number; balances: BalanceRow[] }>(`/api/leave/balances?year=${year}`, apiFetcher);
  const { data: rows, mutate: mutateRows } = useSWR<LeaveRow[]>(`/api/leave/requests?scope=mine&year=${year}`, apiFetcher);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this leave request?")) return;
    setBusyId(id); setError(null);
    try { await apiPost(`/api/leave/requests/${id}/action`, { action: "cancel" }); await Promise.all([mutateRows(), mutateBal()]); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not cancel"); }
    setBusyId(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button className={btnCls} onClick={() => setYear(year - 1)} aria-label="Previous year">←</button>
          <span className="w-16 text-center text-sm font-semibold text-gray-800">{year}</span>
          <button className={btnCls} onClick={() => setYear(year + 1)} aria-label="Next year">→</button>
        </div>
        {!applying && <button className={primaryCls} onClick={() => { setApplying(true); setNotice(null); }}>Apply for leave</button>}
      </div>

      {notice && <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}
      {applying && (
        <ApplyForm meta={meta} onCancel={() => setApplying(false)}
          onDone={(msg) => { setApplying(false); setNotice(msg); void mutateRows(); void mutateBal(); }} />
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">My balances, {year}</h2>
        {!bal ? <p className="text-sm text-gray-400">Loading…</p> : bal.balances.length === 0 ? (
          <p className="text-sm text-gray-500">No leave type keeps a balance yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {bal.balances.map((b) => (
              <div key={b.leaveTypeId} className="rounded-lg border border-gray-200 bg-white px-4 py-3" style={{ borderTopColor: b.colour, borderTopWidth: 3 }}>
                <div className="text-xs text-gray-500">{b.name}</div>
                {b.configured ? (
                  <>
                    <div className={`text-3xl font-semibold leading-tight ${b.balance < 0 ? "text-red-600" : "text-gray-800"}`}>{b.balance}<span className="text-base font-normal text-gray-400"> days left</span></div>
                    <div className="mt-1 text-xs text-gray-500">
                      {b.entitled}{b.carriedForward ? ` + ${b.carriedForward} brought forward` : ""}{b.adjustment ? ` ${b.adjustment > 0 ? "+" : "−"} ${Math.abs(b.adjustment)} adjusted` : ""}
                      {" · "}{b.approved} approved{b.pending ? ` · ${b.pending} waiting` : ""}
                    </div>
                  </>
                ) : <div className="mt-1 text-sm text-gray-400">Not set up yet. The HOD will enter it.</div>}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">This is the department&apos;s working figure. The company HR system is the official record.</p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">My requests, {year}</h2>
        {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!rows ? <p className="text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">No leave requested in {year}.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr><th className="px-3 py-2">Leave</th><th className="px-3 py-2">Dates</th><th className="px-3 py-2">Days</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Cover</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.colour }} />{r.typeName}{r.reason && <div className="text-xs text-gray-500">{r.reason}</div>}</td>
                    <td className="whitespace-nowrap px-3 py-2">{fmtRange(r.startDate, r.endDate, r.dayPart)}</td>
                    <td className="px-3 py-2">{r.days}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      {r.decisionNote && (r.status === "Rejected" || r.status === "Cancelled") && <div className="mt-1 text-xs text-gray-500">{r.decisionNote}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.coverName ?? "–"}</td>
                    <td className="px-3 py-2 text-right">{r.actions.includes("cancel") && <button className={dangerCls} disabled={busyId === r.id} onClick={() => cancel(r.id)}>Cancel</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
