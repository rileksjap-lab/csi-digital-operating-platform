"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import type { PaginationMeta } from "@/lib/types/api";
import WoStatusBadge from "@/components/wo/wo-status-badge";
import WoPriorityBadge from "@/components/wo/wo-priority-badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DomainSummary {
  domain: string;
  totalWOs: number;
  open: number;
  inProgress: number;
  pendingApproval: number;
  closed: number;
  totalEffortHours: number;
  avgCompletionDays: number | null;
  overdueCount: number;
}

interface WorkloadsSummary {
  overall: {
    totalWOs: number;
    open: number;
    inProgress: number;
    closed: number;
    totalEffortHours: number;
    overdueCount: number;
  };
  byDomain: DomainSummary[];
}

interface WoRow {
  id: string;
  csiWoNo: string;
  title: string;
  domain: string;
  requestTypeName: string;
  priority: string;
  status: string;
  assignedToName: string | null;
  dueDate: string | null;
  effortHoursTotal: number;
  createdAt: string;
}

const DOMAINS = [
  "All",
  "Solution Design",
  "Consultancy",
  "BIM",
  "Project Monitoring",
  "Google CP",
  "Others",
];

const DOMAIN_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  "Solution Design":    { bg: "bg-blue-50",   text: "text-blue-700",   accent: "bg-blue-500" },
  "Consultancy":        { bg: "bg-purple-50", text: "text-purple-700", accent: "bg-purple-500" },
  "BIM":                { bg: "bg-teal-50",   text: "text-teal-700",   accent: "bg-teal-500" },
  "Project Monitoring": { bg: "bg-amber-50",  text: "text-amber-700",  accent: "bg-amber-500" },
  "Google CP":          { bg: "bg-red-50",    text: "text-red-700",    accent: "bg-red-500" },
  "Others":             { bg: "bg-gray-50",   text: "text-gray-700",   accent: "bg-gray-500" },
};

const WO_STATUSES = ["Open", "InProgress", "PendingApproval", "Closed"];
const STATUS_LABELS: Record<string, string> = {
  Open: "Open",
  InProgress: "In Progress",
  PendingApproval: "Pending Approval",
  Closed: "Closed",
};

// ─── Main ───────────────────────────────────────────────────────────────────

function WorkloadsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeDomain = searchParams.get("domain") ?? "All";
  const activeStatuses = (searchParams.get("status") ?? "").split(",").filter(Boolean);
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");

  const { data: summary } = useSWR<WorkloadsSummary>(
    "/api/workloads/summary",
    apiFetcher
  );

  const woParams = new URLSearchParams();
  if (activeDomain !== "All") woParams.set("domain", activeDomain);
  if (activeStatuses.length > 0) woParams.set("status", activeStatuses.join(","));
  const qParam = searchParams.get("q");
  if (qParam) woParams.set("q", qParam);
  woParams.set("limit", "25");
  const afterParam = searchParams.get("after");
  if (afterParam) woParams.set("after", afterParam);

  const { data: woData, isLoading: woLoading } = useSWR(
    `/api/wo?${woParams.toString()}`,
    async (url: string) => {
      const res = await fetch(url);
      if (res.status === 401) {
        window.location.href = "/api/auth/login";
        throw new Error("Unauthenticated");
      }
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
      return { rows: json.data as WoRow[], meta: json.meta as PaginationMeta };
    }
  );

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("after");
      router.replace(`?${params.toString()}`);
    },
    [searchParams, router]
  );

  function setDomain(domain: string) {
    updateParam("domain", domain === "All" ? "" : domain);
  }

  function toggleStatus(status: string) {
    const current = new Set(activeStatuses);
    if (current.has(status)) current.delete(status);
    else current.add(status);
    updateParam("status", Array.from(current).join(","));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      updateParam("q", searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, updateParam]);

  const currentDomainData =
    activeDomain === "All"
      ? summary?.overall
      : summary?.byDomain.find((d) => d.domain === activeDomain);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Workloads</h1>
        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* Domain Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {DOMAINS.map((d) => {
          const isActive = activeDomain === d;
          const domainData = d === "All"
            ? summary?.overall
            : summary?.byDomain.find((bd) => bd.domain === d);
          const count = domainData?.totalWOs ?? 0;

          return (
            <button
              key={d}
              onClick={() => setDomain(d)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "text-primary-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {d}
              {count > 0 && (
                <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs ${
                  isActive ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {count}
                </span>
              )}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* KPI Cards for selected domain */}
      {currentDomainData && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Total WOs"
            value={currentDomainData.totalWOs}
            color="text-gray-900"
          />
          <KpiCard
            label="Open"
            value={"open" in currentDomainData ? currentDomainData.open : 0}
            color="text-blue-600"
          />
          <KpiCard
            label="In Progress"
            value={"inProgress" in currentDomainData ? currentDomainData.inProgress : 0}
            color="text-yellow-600"
          />
          <KpiCard
            label="Closed"
            value={"closed" in currentDomainData ? currentDomainData.closed : 0}
            color="text-green-600"
          />
          <KpiCard
            label="Effort Hours"
            value={currentDomainData.totalEffortHours}
            format="hours"
            color="text-purple-600"
          />
          <KpiCard
            label="Overdue"
            value={"overdueCount" in currentDomainData ? currentDomainData.overdueCount : 0}
            color={("overdueCount" in currentDomainData && currentDomainData.overdueCount > 0) ? "text-red-600" : "text-green-600"}
          />
        </div>
      )}

      {/* Tender Pipeline Summary (shown on Solution Design tab or All) */}
      {(activeDomain === "All" || activeDomain === "Solution Design") && (
        <TenderPipelineBanner />
      )}

      {/* Filters */}
      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {WO_STATUSES.map((s) => {
            const isActive = activeStatuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search WO number, title..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 min-w-[200px] rounded border border-gray-300 px-3 py-1.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none"
          />
          {(activeStatuses.length > 0 || searchInput || activeDomain !== "All") && (
            <button
              onClick={() => router.replace("/workloads")}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* WO Table */}
      {woLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {woData && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                  <th className="px-4 py-3 text-left">WO No</th>
                  <th className="px-4 py-3 text-left">Title</th>
                  {activeDomain === "All" && (
                    <th className="px-4 py-3 text-left">Domain</th>
                  )}
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Assignee</th>
                  <th className="px-4 py-3 text-left">Due</th>
                  <th className="px-4 py-3 text-right">Effort</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {woData.rows.length === 0 ? (
                  <tr>
                    <td colSpan={activeDomain === "All" ? 9 : 8} className="px-4 py-12 text-center text-gray-400">
                      No work orders found
                    </td>
                  </tr>
                ) : (
                  woData.rows.map((wo) => {
                    const domainColor = DOMAIN_COLORS[wo.domain];
                    return (
                      <tr
                        key={wo.id}
                        onClick={() => router.push(`/wo/${wo.id}`)}
                        className="cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500 whitespace-nowrap">
                          {wo.csiWoNo}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[250px] truncate">
                          {wo.title}
                        </td>
                        {activeDomain === "All" && (
                          <td className="px-4 py-3">
                            {domainColor && (
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${domainColor.bg} ${domainColor.text}`}>
                                {wo.domain}
                              </span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 text-gray-600 text-xs">{wo.requestTypeName}</td>
                        <td className="px-4 py-3"><WoPriorityBadge priority={wo.priority} /></td>
                        <td className="px-4 py-3"><WoStatusBadge status={wo.status} /></td>
                        <td className="px-4 py-3 text-gray-600">{wo.assignedToName ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {wo.dueDate
                            ? new Date(wo.dueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short" })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {wo.effortHoursTotal > 0 ? `${wo.effortHoursTotal}h` : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {woData.meta.hasNextPage && (
            <div className="border-t border-gray-200 px-4 py-3 text-center">
              <button
                onClick={() => {
                  if (woData.meta.nextCursor) {
                    updateParam("after", woData.meta.nextCursor);
                  }
                }}
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                Load more →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  format,
}: {
  label: string;
  value: number;
  color: string;
  format?: "hours";
}) {
  const display = format === "hours"
    ? `${value.toLocaleString("en-MY", { maximumFractionDigits: 1 })}h`
    : value.toLocaleString();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{display}</p>
    </div>
  );
}

function TenderPipelineBanner() {
  const { data: summary } = useSWR<{
    activeTenders: number;
    pipelineValue: number;
    winRate: number;
    closingSoon: number;
  }>("/api/tender/summary", apiFetcher);

  if (!summary) return null;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-blue-900">Tender Pipeline</h3>
        <Link
          href="/tenders"
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          View all tenders →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-blue-600">Active</p>
          <p className="text-lg font-bold text-blue-900">{summary.activeTenders}</p>
        </div>
        <div>
          <p className="text-xs text-blue-600">Pipeline Value</p>
          <p className="text-lg font-bold text-blue-900">
            {summary.pipelineValue >= 1_000_000
              ? `RM ${(summary.pipelineValue / 1_000_000).toFixed(1)}M`
              : `RM ${(summary.pipelineValue / 1_000).toFixed(0)}K`}
          </p>
        </div>
        <div>
          <p className="text-xs text-blue-600">Win Rate</p>
          <p className="text-lg font-bold text-blue-900">{summary.winRate}%</p>
        </div>
        <div>
          <p className="text-xs text-blue-600">Closing ≤ 30d</p>
          <p className={`text-lg font-bold ${summary.closingSoon > 0 ? "text-orange-600" : "text-blue-900"}`}>
            {summary.closingSoon}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export default function WorkloadsPage() {
  return (
    <Suspense>
      <WorkloadsInner />
    </Suspense>
  );
}
