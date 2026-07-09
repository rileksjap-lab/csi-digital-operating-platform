"use client";

import { Suspense } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import type { PaginationMeta, Role } from "@/lib/types/api";
import { useAuthStore } from "@/lib/stores/auth.store";
import { apiFetcher } from "@/lib/api/fetcher";
import TenderFilterBar from "@/components/tender/tender-filter-bar";
import TenderDataTable from "@/components/tender/tender-data-table";

const TENDER_CREATE_ROLES: Role[] = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

interface TenderSummary {
  activeTenders: number;
  activeValue: number;
  pipelineValue: number;
  winRate: number;
  closingSoon: number;
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000_000) return `RM ${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `RM ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `RM ${(val / 1_000).toFixed(0)}K`;
  return `RM ${val.toFixed(0)}`;
}

function TenderListInner() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const apiUrl = `/api/tender${queryString ? `?${queryString}` : ""}`;
  const user = useAuthStore((s) => s.user);
  const canCreate = user ? TENDER_CREATE_ROLES.includes(user.role) : false;

  const { data: summary } = useSWR<TenderSummary>("/api/tender/summary", apiFetcher);

  const { data, error, isLoading } = useSWR(apiUrl, async (url: string) => {
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = "/api/auth/login";
      throw new Error("Unauthenticated");
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
    return { rows: json.data, meta: json.meta as PaginationMeta };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Tenders</h1>
        {canCreate && (
          <Link
            href="/tenders/new"
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Tender
          </Link>
        )}
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Active Tenders</p>
            <p className="mt-1 text-2xl font-bold text-blue-600">{summary.activeTenders}</p>
            <p className="mt-0.5 text-xs text-gray-500">Worth {formatCurrency(summary.activeValue)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pipeline Value</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(summary.pipelineValue)}</p>
            <p className="mt-0.5 text-xs text-gray-500">All active + submitted</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Win Rate (YTD)</p>
            <p className="mt-1 text-2xl font-bold text-green-600">{summary.winRate}%</p>
            <p className="mt-0.5 text-xs text-gray-500">Won vs decided</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Closing ≤ 30 Days</p>
            <p className={`mt-1 text-2xl font-bold ${summary.closingSoon > 0 ? "text-orange-600" : "text-green-600"}`}>
              {summary.closingSoon}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">Upcoming deadlines</p>
          </div>
        </div>
      )}

      <TenderFilterBar />

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
        <TenderDataTable
          rows={data.rows as Parameters<typeof TenderDataTable>[0]["rows"]}
          meta={data.meta}
        />
      )}
    </div>
  );
}

export default function TenderListPage() {
  return (
    <Suspense>
      <TenderListInner />
    </Suspense>
  );
}
