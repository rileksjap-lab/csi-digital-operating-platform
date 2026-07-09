"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { useSearchParams } from "next/navigation";
import type { PaginationMeta } from "@/lib/types/api";
import { useAuthStore } from "@/lib/stores/auth.store";
import WoStatusBadge from "@/components/wo/wo-status-badge";
import WoPriorityBadge from "@/components/wo/wo-priority-badge";
import WoSlaBadge from "@/components/wo/wo-sla-badge";

type SourceTab = "external" | "internal";

const TABS: { key: SourceTab; label: string; description: string }[] = [
  {
    key: "external",
    label: "Incoming (External)",
    description: "WOs from other departments via EWM, CMT email, or direct request",
  },
  {
    key: "internal",
    label: "Internal (CSI)",
    description: "WOs created within CSIDOP by CSI staff",
  },
];

interface WoRow {
  id: string;
  csiWoNo: string;
  extWoNo: string | null;
  title: string;
  domain: string;
  requestTypeName: string;
  priority: string;
  sourceOfWO: string | null;
  tierCode: number;
  assignedToName: string | null;
  dueDate: string | null;
  slaDaysRemaining: number | null;
  slaStatus: string | null;
  status: string;
  effortHoursTotal: number;
  progressPercent: number;
  createdAt: string;
}

interface WoListResponse {
  rows: WoRow[];
  meta: PaginationMeta;
}

function InboxInner() {
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<SourceTab>(
    (searchParams.get("sourceType") as SourceTab) || "external"
  );
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const [cursor, setCursor] = useState<string | null>(searchParams.get("after"));
  const [pageOffset, setPageOffset] = useState(0);
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const isHOD = user?.role === "HOD";

  async function handleCheckEmail() {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await fetch("/api/wo/poll-email", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setPollResult(`${json.data.created} new WO(s) imported`);
        mutate((key: string) => typeof key === "string" && key.startsWith("/api/wo"), undefined, { revalidate: true });
      } else {
        setPollResult(json.error?.message ?? "Failed to check email");
      }
    } catch {
      setPollResult("Network error");
    } finally {
      setPolling(false);
    }
  }

  // Build query params from state
  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set("sourceType", activeTab);
    if (statusFilter) p.set("status", statusFilter);
    if (query) p.set("q", query);
    if (cursor) p.set("after", cursor);
    return p;
  }, [activeTab, statusFilter, query, cursor]);

  // Sync URL bar so refresh preserves state
  useEffect(() => {
    const p = buildParams();
    const qs = p.toString();
    const newUrl = qs ? `/wo/inbox?${qs}` : "/wo/inbox";
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [buildParams]);

  const apiUrl = (() => {
    const p = buildParams();
    p.set("sortBy", "createdAt");
    p.set("sortDir", "desc");
    return `/api/wo?${p.toString()}`;
  })();

  const { data, error, isLoading } = useSWR<WoListResponse>(apiUrl, async (url: string) => {
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = "/api/auth/login";
      throw new Error("Unauthenticated");
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
    return { rows: json.data, meta: json.meta };
  });

  function switchTab(tab: SourceTab) {
    setActiveTab(tab);
    setStatusFilter("");
    setQuery("");
    setSearchInput("");
    setCursor(null);
    setPageOffset(0);
  }

  const updateStatusFilter = useCallback((newStatus: string) => {
    setStatusFilter(newStatus);
    setCursor(null);
    setPageOffset(0);
  }, []);

  const updateQuery = useCallback((newQuery: string) => {
    setQuery(newQuery);
    setCursor(null);
    setPageOffset(0);
  }, []);

  function handleNextPage() {
    if (!data?.meta?.nextCursor) return;
    setCursor(data.meta.nextCursor);
    setPageOffset((prev) => prev + (data?.rows?.length ?? 0));
  }

  function handleFirstPage() {
    setCursor(null);
    setPageOffset(0);
  }

  const activeStatuses = statusFilter.split(",").filter(Boolean);
  function toggleStatus(status: string) {
    const current = new Set(activeStatuses);
    if (current.has(status)) current.delete(status);
    else current.add(status);
    updateStatusFilter(Array.from(current).join(","));
  }

  const tabInfo = TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">WO Inbox</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tabInfo.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {isHOD && activeTab === "external" && (
            <button
              onClick={handleCheckEmail}
              disabled={polling}
              className="flex items-center gap-1.5 rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              <svg className={`h-4 w-4 ${polling ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {polling ? "Checking..." : "Check Email"}
            </button>
          )}
          <Link
            href="/wo"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            View All WOs
          </Link>
        </div>
      </div>

      {/* Poll result toast */}
      {pollResult && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
          <span>{pollResult}</span>
          <button onClick={() => setPollResult(null)} className="text-blue-400 hover:text-blue-600 ml-3">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            className={`relative px-5 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-primary-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.key === "external" ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              )}
              {tab.label}
            </span>
            {activeTab === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600" />
            )}
          </button>
        ))}
      </div>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap gap-1.5">
          {["Open", "InProgress", "PendingApproval", "Closed"].map((s) => {
            const labels: Record<string, string> = {
              Open: "Open", InProgress: "In Progress", PendingApproval: "Pending", Closed: "Closed",
            };
            const isActive = activeStatuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          placeholder="Search WO number or title..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            clearTimeout((window as unknown as Record<string, ReturnType<typeof setTimeout>>).__inboxSearch);
            (window as unknown as Record<string, ReturnType<typeof setTimeout>>).__inboxSearch = setTimeout(
              () => updateQuery(e.target.value),
              300
            );
          }}
          className="flex-1 min-w-[180px] rounded border border-gray-300 px-3 py-1.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {data && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">WO No.</th>
                  {activeTab === "external" && (
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Source</th>
                  )}
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Priority</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Assignee</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">SLA</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Progress</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={activeTab === "external" ? 10 : 9} className="px-4 py-12 text-center text-gray-400">
                      {activeTab === "external"
                        ? "No incoming work orders from external departments"
                        : "No internally created work orders"}
                    </td>
                  </tr>
                )}
                {data.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/wo/${row.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                        {row.csiWoNo}
                      </Link>
                    </td>
                    {activeTab === "external" && (
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {row.sourceOfWO ?? "—"}
                        </span>
                      </td>
                    )}
                    <td className="px-4 py-3 max-w-[260px] truncate">
                      <Link href={`/wo/${row.id}`} className="hover:text-primary-600">
                        {row.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{row.requestTypeName}</td>
                    <td className="px-4 py-3"><WoPriorityBadge priority={row.priority} /></td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {row.assignedToName ?? <span className="text-gray-400 italic">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3">
                      <WoSlaBadge slaStatus={row.slaStatus} slaDaysRemaining={row.slaDaysRemaining} />
                    </td>
                    <td className="px-4 py-3"><WoStatusBadge status={row.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-200 min-w-[40px]">
                          <div
                            className={`h-full rounded-full ${row.progressPercent === 100 ? "bg-green-500" : "bg-primary-500"}`}
                            style={{ width: `${row.progressPercent}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-gray-500 w-7 text-right">{row.progressPercent}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(row.createdAt).toLocaleDateString("en-MY")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.meta && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
              <span>
                {data.rows.length > 0
                  ? `Showing ${pageOffset + 1}-${pageOffset + data.rows.length} of ${data.meta.total} work orders`
                  : `Showing 0 of ${data.meta.total} work orders`}
              </span>
              <div className="flex items-center gap-2">
                {cursor && (
                  <button
                    onClick={handleFirstPage}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    &larr; First page
                  </button>
                )}
                {data.meta.hasNextPage && (
                  <button onClick={handleNextPage} className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">
                    Next page &rarr;
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function WoInboxPage() {
  return (
    <Suspense>
      <InboxInner />
    </Suspense>
  );
}
