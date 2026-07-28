"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";
import WoPageTabs from "@/components/wo/wo-page-tabs";

interface RequestTypeOption {
  Id: string;
  TypeName: string;
}

interface LookupsResponse {
  requestTypes: RequestTypeOption[];
}

interface EngagementRow {
  id: string;
  csiWoNo: string;
  title: string;
  requestTypeName: string;
  assignedToName: string | null;
  status: string;
  indicativeValue: number | null;
  dueDate: string | null;
}

interface WoListResponse {
  data: EngagementRow[];
}

const ENGAGEMENT_TYPES = ["Leads / Opportunity", "Tender / RFP", "Tender / Pre-Bid"];
const ACTIVE_STATUSES = "Open,InProgress,PendingApproval,OnHold";

const TYPE_COLORS: Record<string, string> = {
  "Tender / RFP": "bg-blue-100 text-blue-700",
  "Tender / Pre-Bid": "bg-amber-100 text-amber-700",
  "Leads / Opportunity": "bg-teal-100 text-teal-700",
};

const STATUS_COLORS: Record<string, string> = {
  Open: "text-blue-700",
  InProgress: "text-amber-700",
  PendingApproval: "text-purple-700",
  OnHold: "text-gray-500",
};

type SortKey = "title" | "requestTypeName" | "assignedToName" | "status" | "indicativeValue" | "dueDate";

function formatValue(v: number | null): string {
  if (v == null) return "—";
  return `RM ${(v / 1_000_000).toFixed(1)}M`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

function SortableTh({
  label, sortKey, activeKey, dir, onSort, align,
}: {
  label: string; sortKey: SortKey; activeKey: SortKey; dir: "asc" | "desc";
  onSort: (k: SortKey) => void; align?: "right";
}) {
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-2 text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {activeKey === sortKey && <span className="text-primary-600">{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

export default function EngagementOverviewPage() {
  const { data: lookups } = useSWR<LookupsResponse>("/api/lookups", apiFetcher);
  const [sortKey, setSortKey] = useState<SortKey>("dueDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const typeIds = useMemo(() => {
    if (!lookups) return null;
    const ids = ENGAGEMENT_TYPES
      .map((name) => lookups.requestTypes.find((t) => t.TypeName === name)?.Id)
      .filter((id): id is string => !!id);
    return ids.length > 0 ? ids.join(",") : null;
  }, [lookups]);

  const apiUrl = typeIds
    ? `/api/wo?requestTypeId=${typeIds}&status=${ACTIVE_STATUSES}&sortBy=dueDate&sortDir=asc&limit=100`
    : null;

  const { data, isLoading } = useSWR<WoListResponse>(apiUrl, async (url: string) => {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
    return json;
  });

  const rows = data?.data ?? [];

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        sortKey === "dueDate"
          ? new Date(av as string).getTime() - new Date(bv as string).getTime()
          : av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalValue = rows.reduce((sum, r) => sum + (r.indicativeValue ?? 0), 0);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Engagement Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Leads, Tender / RFP, and Tender / Pre-Bid work — active engagements only
          </p>
        </div>
        <WoPageTabs active="engagement" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-500">
            <span className="font-semibold text-gray-800">{rows.length}</span> engagements
          </span>
          <span className="text-gray-500">
            <span className="font-semibold text-gray-800">{formatValue(totalValue)}</span> total value
          </span>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-12 text-center text-sm text-gray-500">
          No active engagements found
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          {rows.length >= 100 && (
            <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
              Showing the first 100 results — narrow your filters if you need more.
            </div>
          )}
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <SortableTh label="Name" sortKey="title" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Type" sortKey="requestTypeName" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="OO" sortKey="assignedToName" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortableTh label="Value" sortKey="indicativeValue" activeKey={sortKey} dir={sortDir} onSort={handleSort} align="right" />
                <SortableTh label="Due date" sortKey="dueDate" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2.5">
                    <Link href={`/wo/${r.id}`} className="text-primary-600 hover:text-primary-700 font-medium">
                      {r.title}
                    </Link>
                    <div className="text-xs text-gray-400">{r.csiWoNo}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[r.requestTypeName] ?? "bg-gray-100 text-gray-600"}`}>
                      {r.requestTypeName}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{r.assignedToName ?? "—"}</td>
                  <td className={`px-3 py-2.5 font-medium ${STATUS_COLORS[r.status] ?? "text-gray-600"}`}>{r.status}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-800">{formatValue(r.indicativeValue)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{formatDate(r.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
