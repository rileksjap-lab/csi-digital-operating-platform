"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";
import { STATUS_LABEL, type AppraisalStatus } from "@/lib/kpi/workflow";

interface Report {
  cycle: { id: string; name: string; status: string };
  recipients: string[];
  subject: string;
  attachments: string[];
  rows: {
    id: string; name: string; roleName: string; subTeam: string | null; reviewerName: string; finalApproverName: string;
    status: AppraisalStatus; kra: number | null; value: number | null; bonus: number | null; total: number | null;
    outcome: string | null; finalisedAt: string | null; sentToHrAt: string | null;
  }[];
  counts: { total: number; ready: number; pending: number; sent: number };
  blockers: string[];
  cannotSend: string | null;
  canSend: boolean;
  history: { sentAt: string; sentBy: string; recipients: string[]; count: number; status: "Sent" | "Failed" | "Simulated"; error: string | null }[];
}
interface Cycles { cycles: { id: string; name: string }[]; cycleId: string | null }

const TONE: Record<AppraisalStatus, string> = {
  SelfAssessment: "bg-gray-100 text-gray-600", SuperiorReview: "bg-blue-50 text-blue-700", HODReview: "bg-purple-50 text-purple-700",
  Finalised: "bg-green-50 text-green-700", SentToHR: "bg-green-100 text-green-800",
};

export default function HrReportPage() {
  const role = useAuthStore((s) => s.user?.kpiRole);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const { data: cycles } = useSWR<Cycles>("/api/kpi/appraisals", apiFetcher);
  const activeId = cycleId ?? cycles?.cycleId ?? null;
  const { data, error, mutate } = useSWR<Report>(activeId ? `/api/kpi/hr-report?cycleId=${activeId}` : null, apiFetcher);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (role && role !== "HOD" && role !== "SVP") {
    return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">Only the HOD and the SVP can open the HR report.</div>;
  }
  if (error) return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>;
  if (!cycles || (activeId && !data)) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;
  if (!activeId || !data) return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">There is no KPI cycle yet.</div>;

  async function send(resend: boolean) {
    setBusy(true); setResult(null);
    const res = await fetch("/api/kpi/hr-report/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cycleId: activeId, resend }) });
    const json = await res.json().catch(() => null);
    if (json?.success) {
      const d = json.data as { sent: number; newlySent: number; simulated: boolean; recipients: string[] };
      setResult({
        kind: "ok",
        text: d.simulated
          ? `Test run: the email was not really sent because no mail server is set up here. ${d.sent} appraisals were included and ${d.newlySent} marked as sent.`
          : `Sent to ${d.recipients.join(", ")}: ${d.sent} appraisals (${d.newlySent} newly marked as sent to HR).`,
      });
      setConfirming(false);
      await mutate();
    } else {
      const extra = (json?.error?.errors ?? []).map((e: { message: string }) => e.message);
      setResult({ kind: "error", text: [json?.error?.message ?? "Could not send", ...extra.slice(0, 6)].join(" · ") });
    }
    setBusy(false);
  }

  const d = data;
  const fmt = (n: number | null) => (n === null ? "–" : String(n));
  const card = (label: string, value: number, tone = "bg-white border-gray-200") => (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-3xl font-semibold text-gray-800">{value}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/kpi/appraisals" className="link-action text-xs">← KPI Appraisal</Link>
          <h1 className="text-xl font-semibold text-gray-800">HR report</h1>
          <p className="text-sm text-gray-500">Final results for {d.cycle.name}, ready to send to Human Resources.</p>
        </div>
        <div className="flex items-center gap-2">
          {cycles.cycles.length > 1 && (
            <select value={activeId} onChange={(e) => { setCycleId(e.target.value); setResult(null); setConfirming(false); }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              {cycles.cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <a href={`/api/kpi/hr-report/summary?cycleId=${activeId}`} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Download summary (Excel/CSV)
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {card("Appraisals", d.counts.total)}
        {card("Finalised", d.counts.ready, "bg-green-50 border-green-200")}
        {card("Waiting to be sent", d.counts.pending, "bg-amber-50 border-amber-200")}
        {card("Already sent to HR", d.counts.sent)}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-800">Send to HR</h2>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-gray-700">
          <p><span className="text-xs text-gray-500">To: </span>{d.recipients.length ? d.recipients.join(", ") : <span className="text-amber-700">not set</span>}</p>
          <p><span className="text-xs text-gray-500">Subject: </span>{d.subject}</p>
          <p><span className="text-xs text-gray-500">Attached: </span>a summary (CSV) and one PDF form for each finalised person ({d.attachments.length - 1} PDFs).</p>
          {d.cannotSend && <p className="rounded bg-amber-50 px-3 py-2 text-amber-900">{d.cannotSend}{d.blockers.length > 0 ? ` (${d.blockers.slice(0, 4).join("; ")}${d.blockers.length > 4 ? "…" : ""})` : ""}</p>}
          {result && <p className={`rounded px-3 py-2 ${result.kind === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{result.text}</p>}

          {confirming ? (
            <div className="rounded border border-primary-200 bg-primary-50 p-4">
              <p className="font-medium text-gray-800">Send these results to {d.recipients.join(", ")}?</p>
              <p className="mt-1 text-xs text-gray-600">{d.counts.ready} appraisals will be attached. The finalised ones are marked as sent to HR and locked.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => send(d.counts.pending === 0)} disabled={busy} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40">
                  {busy ? "Sending…" : d.counts.pending === 0 ? "Yes, resend" : "Yes, send now"}
                </button>
                <button onClick={() => setConfirming(false)} disabled={busy} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setConfirming(true); setResult(null); }} disabled={!d.canSend} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40">
              {d.counts.pending === 0 && d.counts.ready > 0 ? "Resend to HR" : "Send to HR"}
            </button>
          )}
        </div>
      </section>

      <section className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-4 py-2">Name</th><th className="px-2 py-2">Role</th><th className="px-2 py-2">Status</th>
              <th className="px-2 py-2 text-right">KRA /60</th><th className="px-2 py-2 text-right">HR /40</th><th className="px-2 py-2 text-right">Bonus /20</th>
              <th className="px-2 py-2 text-right">Total /120</th><th className="px-2 py-2">Outcome</th><th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 align-top">
                <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                <td className="px-2 py-2 text-gray-600">{r.roleName}</td>
                <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="px-2 py-2 text-right">{fmt(r.kra)}</td><td className="px-2 py-2 text-right">{fmt(r.value)}</td>
                <td className="px-2 py-2 text-right">{fmt(r.bonus)}</td><td className="px-2 py-2 text-right font-semibold">{fmt(r.total)}</td>
                <td className="max-w-[260px] px-2 py-2 text-xs text-gray-600">{r.outcome ?? "–"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <Link href={`/kpi/appraisals/${r.id}`} className="inline-block rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">View</Link>
                  {(r.status === "Finalised" || r.status === "SentToHR") && <a href={`/api/kpi/appraisals/${r.id}/pdf`} className="ml-2 inline-block rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">PDF</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {d.history.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3"><h2 className="text-sm font-semibold text-gray-800">Sending history</h2></div>
          <ul className="divide-y divide-gray-50 text-sm">
            {d.history.map((h, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2">
                <span className="text-gray-700">{new Date(h.sentAt).toLocaleString("en-MY")} · {h.sentBy} · {h.count} appraisals to {h.recipients.join(", ")}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${h.status === "Sent" ? "bg-green-50 text-green-700" : h.status === "Simulated" ? "bg-gray-100 text-gray-600" : "bg-red-50 text-red-700"}`}>
                  {h.status === "Simulated" ? "Test run" : h.status}{h.error ? `: ${h.error}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
