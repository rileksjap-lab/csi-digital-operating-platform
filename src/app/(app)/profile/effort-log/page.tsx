"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import type { PaginationMeta } from "@/lib/types/api";
import { useAuthStore } from "@/lib/stores/auth.store";

interface EffortEntry {
  id: string;
  woId: string;
  csiWoNo: string;
  staffId: string;
  staffName: string;
  logDate: string;
  hours: number;
  notes: string | null;
  createdAt: string;
}

interface EffortListResponse {
  rows: EffortEntry[];
  meta: PaginationMeta;
}

function MyEffortLogInner() {
  const user = useAuthStore((s) => s.user);

  const [logDateFrom, setLogDateFrom] = useState("");
  const [logDateTo, setLogDateTo] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [pageOffset, setPageOffset] = useState(0);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (user?.staffId) p.set("staffId", user.staffId);
    if (logDateFrom) p.set("logDateFrom", logDateFrom);
    if (logDateTo) p.set("logDateTo", logDateTo);
    p.set("sortBy", "logDate");
    p.set("sortDir", "desc");
    p.set("limit", "25");
    if (cursor) p.set("after", cursor);
    return p;
  }, [user?.staffId, logDateFrom, logDateTo, cursor]);

  const apiUrl = user?.staffId ? `/api/effort?${buildParams().toString()}` : null;

  const { data, error, isLoading } = useSWR(apiUrl, async (url: string) => {
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = "/api/auth/login";
      throw new Error("Unauthenticated");
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
    return { rows: json.data, meta: json.meta } as EffortListResponse;
  });

  function applyDateFilter(from: string, to: string) {
    setLogDateFrom(from);
    setLogDateTo(to);
    setCursor(null);
    setPageOffset(0);
  }

  function handleNextPage() {
    if (!data?.meta?.nextCursor) return;
    setCursor(data.meta.nextCursor);
    setPageOffset((prev) => prev + (data.rows?.length ?? 0));
  }

  function handleFirstPage() {
    setCursor(null);
    setPageOffset(0);
  }

  const totalHoursOnPage = data?.rows.reduce((sum, e) => sum + e.hours, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">My Effort Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Every effort entry logged under your name, across all work orders.
          </p>
        </div>
        <Link
          href="/profile"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          &larr; Back to Profile
        </Link>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label className="block text-xs font-medium text-gray-600">From</label>
          <input
            type="date"
            value={logDateFrom}
            onChange={(e) => applyDateFilter(e.target.value, logDateTo)}
            className="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">To</label>
          <input
            type="date"
            value={logDateTo}
            onChange={(e) => applyDateFilter(logDateFrom, e.target.value)}
            className="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>
        {(logDateFrom || logDateTo) && (
          <button
            onClick={() => applyDateFilter("", "")}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Clear dates
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {data && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Work Order</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                      No effort logged in this range.
                    </td>
                  </tr>
                )}
                {data.rows.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(e.logDate).toLocaleDateString("en-MY")}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/wo/${e.woId}`}
                        className="font-mono text-xs text-primary-600 hover:underline"
                      >
                        {e.csiWoNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{e.hours}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{e.notes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="px-4 py-2 text-xs font-medium text-gray-500" colSpan={2}>
                      Total (this page)
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700 tabular-nums">
                      {totalHoursOnPage}h
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination footer */}
          {data.meta && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-xs text-gray-500">
              <span>
                {data.rows.length > 0
                  ? `Showing ${pageOffset + 1}-${pageOffset + data.rows.length} of ${data.meta.total} entries`
                  : `Showing 0 of ${data.meta.total} entries`}
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
                  <button
                    onClick={handleNextPage}
                    className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
                  >
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

export default function MyEffortLogPage() {
  return (
    <Suspense>
      <MyEffortLogInner />
    </Suspense>
  );
}
