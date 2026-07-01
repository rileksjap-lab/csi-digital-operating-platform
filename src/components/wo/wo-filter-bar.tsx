"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

const STATUSES = [
  "Open", "Acknowledged", "InProgress", "PendingApproval",
  "Approved", "Closed", "Returned", "Cancelled",
];
const STATUS_LABELS: Record<string, string> = {
  Open: "Open",
  Acknowledged: "Acknowledged",
  InProgress: "In Progress",
  PendingApproval: "Pending",
  Approved: "Approved",
  Closed: "Closed",
  Returned: "Returned",
  Cancelled: "Cancelled",
};

const DOMAINS = [
  "Solution Design",
  "Consultancy",
  "BIM",
  "Project Monitoring",
  "Google CP",
  "Others",
];

const SOURCES = ["CMT", "CSA", "CPO", "CBA", "CST", "CSO", "CGI", "CSF", "CHO", "CSI", "CSI HOD", "Others"];

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "dueDate:asc", label: "Due date (soonest)" },
  { value: "dueDate:desc", label: "Due date (latest)" },
  { value: "csiWoNo:desc", label: "WO No. (newest)" },
  { value: "csiWoNo:asc", label: "WO No. (oldest)" },
  { value: "priority:desc", label: "Priority (highest)" },
  { value: "status:asc", label: "Status (A-Z)" },
  { value: "title:asc", label: "Title (A-Z)" },
];

const PAGE_SIZES = [25, 50, 100];

interface StaffOption {
  Id: string;
  Name: string;
}

export default function WoFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { data: staffList } = useSWR<StaffOption[]>(
    showAdvanced ? "/api/staff" : null,
    apiFetcher
  );

  const activeStatuses = (searchParams.get("status") ?? "").split(",").filter(Boolean);
  const activeDomain = searchParams.get("domain") ?? "";
  const activeAssignee = searchParams.get("assignedTo") ?? "";
  const activeSource = searchParams.get("sourceType") ?? "";
  const activeDateFrom = searchParams.get("dueDateFrom") ?? "";
  const activeDateTo = searchParams.get("dueDateTo") ?? "";
  const currentSort = searchParams.get("sortBy") ?? "createdAt";
  const currentDir = searchParams.get("sortDir") ?? "desc";
  const currentLimit = searchParams.get("limit") ?? "25";
  const sortValue = `${currentSort}:${currentDir}`;

  const hasFilters = activeStatuses.length > 0 || activeDomain || activeAssignee
    || activeSource || activeDateFrom || activeDateTo || searchInput;

  useEffect(() => {
    if (activeAssignee || activeSource || activeDateFrom || activeDateTo) {
      setShowAdvanced(true);
    }
  }, [activeAssignee, activeSource, activeDateFrom, activeDateTo]);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("after");
      window.location.href = `/wo?${params.toString()}`;
    },
    [searchParams]
  );

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete("after");
      window.location.href = `/wo?${params.toString()}`;
    },
    [searchParams, router]
  );

  function toggleStatus(status: string) {
    const current = new Set(activeStatuses);
    if (current.has(status)) current.delete(status);
    else current.add(status);
    updateParam("status", Array.from(current).join(","));
  }

  function handleSortChange(val: string) {
    const [sortBy, sortDir] = val.split(":");
    updateParams({ sortBy, sortDir });
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      updateParam("q", searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, updateParam]);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      {/* Row 1: Status pills */}
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
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

      {/* Row 2: Search + Domain + Sort + Per page */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search WO number, title, or remark..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded border border-gray-300 pl-8 pr-3 py-1.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none"
          />
        </div>

        <select
          value={activeDomain}
          onChange={(e) => updateParam("domain", e.target.value)}
          className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
        >
          <option value="">All Domains</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <select
          value={sortValue}
          onChange={(e) => handleSortChange(e.target.value)}
          className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={currentLimit}
          onChange={(e) => updateParam("limit", e.target.value)}
          className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={String(n)}>{n} per page</option>
          ))}
        </select>

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`rounded border px-2 py-1.5 text-xs font-medium transition-colors ${
            showAdvanced
              ? "border-primary-300 bg-primary-50 text-primary-700"
              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          {showAdvanced ? "Less filters ▲" : "More filters ▼"}
        </button>

        {hasFilters && (
          <button
            onClick={() => { window.location.href = "/wo"; }}
            className="text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Row 3: Advanced filters */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <select
            value={activeSource}
            onChange={(e) => updateParam("sourceType", e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
          >
            <option value="">All Sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={activeAssignee}
            onChange={(e) => updateParam("assignedTo", e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
          >
            <option value="">All Assignees</option>
            <option value="unassigned">Unassigned</option>
            {(staffList ?? []).map((s) => (
              <option key={s.Id} value={s.Id}>{s.Name}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Due:</span>
            <input
              type="date"
              value={activeDateFrom}
              onChange={(e) => updateParam("dueDateFrom", e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              placeholder="From"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              type="date"
              value={activeDateTo}
              onChange={(e) => updateParam("dueDateTo", e.target.value)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
              placeholder="To"
            />
          </div>
        </div>
      )}
    </div>
  );
}
