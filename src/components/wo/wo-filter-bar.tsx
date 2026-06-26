"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STATUSES = ["Open", "InProgress", "PendingApproval", "Closed", "OnHold"];
const STATUS_LABELS: Record<string, string> = {
  Open: "Open",
  InProgress: "In Progress",
  PendingApproval: "Pending",
  Closed: "Closed",
  OnHold: "On Hold",
};

const DOMAINS = [
  "Solution Design",
  "Consultancy",
  "BIM",
  "Project Monitoring",
  "Google CP",
  "Others",
];

export default function WoFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(
    searchParams.get("q") ?? ""
  );

  const activeStatuses = (searchParams.get("status") ?? "").split(",").filter(Boolean);
  const activeDomain = searchParams.get("domain") ?? "";

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

  function toggleStatus(status: string) {
    const current = new Set(activeStatuses);
    if (current.has(status)) {
      current.delete(status);
    } else {
      current.add(status);
    }
    updateParam("status", Array.from(current).join(","));
  }

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      updateParam("q", searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, updateParam]);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      {/* Status pills */}
      <div className="flex flex-wrap gap-2">
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

      {/* Second row: domain + search */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={activeDomain}
          onChange={(e) => updateParam("domain", e.target.value)}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none"
        >
          <option value="">All Domains</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search WO number or title..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 min-w-[200px] rounded border border-gray-300 px-3 py-1.5 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none"
        />

        {(activeStatuses.length > 0 || activeDomain || searchInput) && (
          <button
            onClick={() => router.replace("/wo")}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
