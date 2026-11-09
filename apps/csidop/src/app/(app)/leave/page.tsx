"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import MyLeave from "@/components/leave/my-leave";
import TeamPlanner from "@/components/leave/team-planner";
import Approvals from "@/components/leave/approvals";
import LeaveSetup from "@/components/leave/leave-setup";
import type { LeaveRow, Meta } from "@/components/leave/shared";

type Tab = "mine" | "team" | "approvals" | "setup";

export default function LeavePage() {
  const { data: meta } = useSWR<Meta>("/api/leave/meta", apiFetcher);
  const [tab, setTab] = useState<Tab>("mine");
  const { data: pending, mutate: mutatePending } = useSWR<LeaveRow[]>(meta?.canApprove ? "/api/leave/requests?scope=pending" : null, apiFetcher);

  // A notification link opens /leave?tab=approvals.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "mine" || t === "team" || t === "approvals" || t === "setup") setTab(t);
  }, []);

  if (!meta) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "mine", label: "My leave" },
    { key: "team", label: "Team planner" },
    ...(meta.canApprove ? [{ key: "approvals" as const, label: "Approvals", badge: pending?.length ?? 0 }] : []),
    ...(meta.isHod ? [{ key: "setup" as const, label: "Setup" }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : "mine";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">Leave</h1>
        <p className="text-sm text-gray-500">Apply for leave, see who is away, and approve requests. Requests go to a Solution Manager, then the HOD.</p>
      </div>

      {meta.actingForHod && (
        <div className="rounded border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          You are covering for the HOD on leave approvals right now. Your approvals are recorded as &ldquo;Acting for the HOD&rdquo;.
        </div>
      )}

      <div role="tablist" aria-label="Leave sections" className="flex flex-wrap gap-2">
        {tabs.map((x) => (
          <button
            key={x.key} role="tab" aria-selected={active === x.key} onClick={() => setTab(x.key)}
            className={`whitespace-nowrap rounded-lg border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${active === x.key ? "border-primary-600 bg-primary-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"}`}
          >
            {x.label}
            {x.badge ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800">{x.badge}</span> : null}
          </button>
        ))}
      </div>

      {active === "mine" && <MyLeave meta={meta} />}
      {active === "team" && <TeamPlanner />}
      {active === "approvals" && <Approvals onChanged={() => void mutatePending()} />}
      {active === "setup" && <LeaveSetup />}
    </div>
  );
}
