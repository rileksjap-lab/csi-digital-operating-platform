"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import { btnCls, dangerCls, fmtDays, fmtRange, inputCls, primaryCls, STATUS_LABEL, STATUS_TONE, type BalanceRow, type LeaveRow } from "@/components/leave/shared";

function Balance({ staffId, leaveTypeId, year }: { staffId: string; leaveTypeId: string; year: number }) {
  const { data } = useSWR<{ balances: BalanceRow[] }>(`/api/leave/balances?year=${year}&staffId=${staffId}`, apiFetcher);
  const b = data?.balances.find((x) => x.leaveTypeId === leaveTypeId);
  if (!b || !b.configured) return null;
  return <span className={`text-xs ${b.balance < 0 ? "text-red-600" : "text-gray-500"}`}>Balance after this request: {b.balance} day{b.balance === 1 ? "" : "s"}</span>;
}

export default function Approvals({ onChanged }: { onChanged: () => void }) {
  const { data, mutate } = useSWR<LeaveRow[]>("/api/leave/requests?scope=pending", apiFetcher);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject") {
    setBusy(id); setError(null);
    try {
      await apiPost(`/api/leave/requests/${id}/action`, { action, note: note.trim() || null });
      setRejecting(null); setNote("");
      await mutate(); onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save"); }
    setBusy(null);
  }

  if (!data) return <p className="text-sm text-gray-400">Loading…</p>;
  if (data.length === 0) return <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-400">Nothing is waiting for you.</p>;

  return (
    <div className="space-y-3">
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {data.map((r) => (
        <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">{r.staffName}</p>
              <p className="text-sm text-gray-700"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.colour }} />{r.typeName}: {fmtRange(r.startDate, r.endDate, r.dayPart)} · {fmtDays(r.days)}</p>
              {r.reason && <p className="mt-1 text-sm text-gray-600">&ldquo;{r.reason}&rdquo;</p>}
              <p className="mt-1 text-xs text-gray-500">Cover: {r.coverName ?? "no one named"}</p>
              <Balance staffId={r.staffId} leaveTypeId={r.leaveTypeId} year={Number(r.startDate.slice(0, 4))} />
            </div>
            <span className={`rounded px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
          </div>
          {rejecting === r.id ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[260px] flex-1 text-xs text-gray-500">Why not? (the person will see this)
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} mt-1`} />
              </label>
              <button className={dangerCls} disabled={busy === r.id || !note.trim()} onClick={() => act(r.id, "reject")}>Confirm, do not approve</button>
              <button className={btnCls} onClick={() => { setRejecting(null); setNote(""); }}>Back</button>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              {r.actions.includes("approve") && <button className={primaryCls} disabled={busy === r.id} onClick={() => act(r.id, "approve")}>Approve</button>}
              {r.actions.includes("reject") && <button className={btnCls} disabled={busy === r.id} onClick={() => { setRejecting(r.id); setNote(""); }}>Do not approve</button>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
