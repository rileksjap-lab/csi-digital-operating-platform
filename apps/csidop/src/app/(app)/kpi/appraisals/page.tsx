"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";
import { STATUS_LABEL, type AppraisalStatus, type WorkflowAction } from "@/lib/kpi/workflow";

interface Row {
  id: string; staffId: string; staffName: string; roleName: string; subTeam: string | null;
  status: AppraisalStatus; reviewerName: string; finalApproverName: string;
  totalPoints: number | null; outcome: string | null; actions: WorkflowAction[];
}
interface Data {
  cycles: { id: string; name: string; status: "Draft" | "Open" | "Closed" }[];
  cycleId: string | null;
  appraisals: Row[];
}

const TONE: Record<AppraisalStatus, string> = {
  SelfAssessment: "bg-gray-100 text-gray-600",
  SuperiorReview: "bg-blue-50 text-blue-700",
  HODReview: "bg-purple-50 text-purple-700",
  Finalised: "bg-green-50 text-green-700",
  SentToHR: "bg-green-100 text-green-800",
};

// Steps where the person is expected to do something now.
const YOUR_TURN: WorkflowAction[] = ["submitSelf", "submitReview", "finalise"];

export default function KpiAppraisalsPage() {
  const [cycleId, setCycleId] = useState<string | null>(null);
  const { data, error, mutate } = useSWR<Data>(`/api/kpi/appraisals${cycleId ? `?cycleId=${cycleId}` : ""}`, apiFetcher);
  const me = useAuthStore((s) => s.user);
  const isHod = me?.role === "HOD";
  const [opening, setOpening] = useState(false);
  const [openResult, setOpenResult] = useState<{ created: number; skipped: { name: string; reason: string }[] } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  if (error) return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>;
  if (!data) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;

  const cycle = data.cycles.find((c) => c.id === data.cycleId) ?? null;
  const mine = data.appraisals.filter((a) => a.staffId === me?.staffId);
  const others = data.appraisals.filter((a) => a.staffId !== me?.staffId);

  async function openAppraisals() {
    if (!cycle) return;
    setOpening(true); setOpenError(null); setOpenResult(null);
    try {
      setOpenResult(await apiPost(`/api/kpi/appraisals`, { cycleId: cycle.id }));
      await mutate();
    } catch (e) { setOpenError(e instanceof Error ? e.message : "Could not open appraisals"); } finally { setOpening(false); }
  }

  const table = (rows: Row[]) => (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="px-4 py-2">Name</th><th className="px-2 py-2">Role</th><th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Reviewer</th><th className="px-2 py-2">Final by</th><th className="px-2 py-2 text-right">Total</th><th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const turn = a.actions.some((x) => YOUR_TURN.includes(x));
            const label = a.actions.includes("submitSelf") ? "Fill in" : a.actions.includes("submitReview") ? "Review" : a.actions.includes("finalise") ? "Finalise" : "View";
            return (
              <tr key={a.id} className="border-b border-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{a.staffName}</td>
                <td className="px-2 py-2 text-gray-600">{a.roleName}{a.subTeam ? ` · ${a.subTeam}` : ""}</td>
                <td className="px-2 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  {turn && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Your turn</span>}
                </td>
                <td className="px-2 py-2 text-gray-600">{a.reviewerName}</td>
                <td className="px-2 py-2 text-gray-600">{a.finalApproverName}</td>
                <td className="px-2 py-2 text-right text-gray-800">{a.totalPoints !== null ? `${a.totalPoints} / 120` : "–"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  <Link
                    href={`/kpi/appraisals/${a.id}`}
                    className={turn
                      ? "inline-block rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700"
                      : "inline-block rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"}
                  >
                    {label}
                  </Link>
                  {(a.status === "Finalised" || a.status === "SentToHR") && <a href={`/api/kpi/appraisals/${a.id}/pdf`} className="ml-2 inline-block rounded border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">PDF</a>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">KPI Appraisal</h1>
          <p className="text-sm text-gray-500">Your appraisal: fill in your own form, review your team, and track each step to HR. Work-order numbers are separate, under Work Performance.</p>
        </div>
        <div className="flex items-center gap-2">
          {data.cycles.length > 1 && (
            <select value={data.cycleId ?? ""} onChange={(e) => setCycleId(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              {data.cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {(isHod || me?.role === "SVP") && (
            <>
              <Link href="/kpi/setup" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">KPI setup</Link>
              <Link href="/kpi/hr-report" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">HR report</Link>
            </>
          )}
          {isHod && cycle?.status === "Open" && (
            <button onClick={openAppraisals} disabled={opening} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40">
              {opening ? "Opening…" : "Open appraisals for the team"}
            </button>
          )}
        </div>
      </div>

      {openError && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{openError}</div>}
      {openResult && (
        <div className="rounded border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          Opened {openResult.created} new appraisal{openResult.created === 1 ? "" : "s"}.
          {openResult.skipped.length > 0 && (
            <>
              <p className="mt-2 text-amber-800">Not opened:</p>
              <ul className="list-disc pl-5 text-xs text-gray-600">{openResult.skipped.map((s) => <li key={s.name}>{s.name}: {s.reason}</li>)}</ul>
            </>
          )}
        </div>
      )}

      {!cycle ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">There is no open KPI cycle yet.</div>
      ) : data.appraisals.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          {cycle.status !== "Open" ? `${cycle.name} is not open yet.` : isHod ? "No appraisals opened yet. Press “Open appraisals for the team” (everyone needs a superior set under KPI setup → Reporting lines)." : "Your appraisal has not been opened yet."}
        </div>
      ) : (
        <>
          {mine.length > 0 && <div className="space-y-2"><h2 className="text-sm font-semibold text-gray-700">My appraisal</h2>{table(mine)}</div>}
          {others.length > 0 && <div className="space-y-2"><h2 className="text-sm font-semibold text-gray-700">{isHod || me?.role === "SVP" ? "Team" : "People I review"}</h2>{table(others)}</div>}
        </>
      )}
    </div>
  );
}
