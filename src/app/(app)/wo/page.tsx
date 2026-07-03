"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import type { PaginationMeta } from "@/lib/types/api";
import type { Role } from "@/lib/types/api";
import { useAuthStore } from "@/lib/stores/auth.store";
import WoFilterBar from "@/components/wo/wo-filter-bar";
import WoDataTable from "@/components/wo/wo-data-table";

const WO_CREATE_ROLES: Role[] = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

interface WoListResponse {
  rows: unknown[];
  meta: PaginationMeta;
}

interface Filters {
  status: string;
  domain: string;
  q: string;
  assignedTo: string;
  sourceType: string;
  dueDateFrom: string;
  dueDateTo: string;
  sortBy: string;
  sortDir: string;
  limit: string;
}

function WoListInner() {
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const canCreate = user ? WO_CREATE_ROLES.includes(user.role) : false;

  const [filters, setFilters] = useState<Filters>({
    status: searchParams.get("status") ?? "",
    domain: searchParams.get("domain") ?? "",
    q: searchParams.get("q") ?? "",
    assignedTo: searchParams.get("assignedTo") ?? "",
    sourceType: searchParams.get("sourceType") ?? "",
    dueDateFrom: searchParams.get("dueDateFrom") ?? "",
    dueDateTo: searchParams.get("dueDateTo") ?? "",
    sortBy: searchParams.get("sortBy") ?? "createdAt",
    sortDir: searchParams.get("sortDir") ?? "desc",
    limit: searchParams.get("limit") ?? "25",
  });
  const [cursor, setCursor] = useState<string | null>(searchParams.get("after"));
  const [pageOffset, setPageOffset] = useState(0);

  // Build query params from state
  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.status) p.set("status", filters.status);
    if (filters.domain) p.set("domain", filters.domain);
    if (filters.q) p.set("q", filters.q);
    if (filters.assignedTo) p.set("assignedTo", filters.assignedTo);
    if (filters.sourceType) p.set("sourceType", filters.sourceType);
    if (filters.dueDateFrom) p.set("dueDateFrom", filters.dueDateFrom);
    if (filters.dueDateTo) p.set("dueDateTo", filters.dueDateTo);
    p.set("sortBy", filters.sortBy);
    p.set("sortDir", filters.sortDir);
    p.set("limit", filters.limit);
    if (cursor) p.set("after", cursor);
    return p;
  }, [filters, cursor]);

  // Sync URL bar so refresh preserves state
  useEffect(() => {
    const p = buildParams();
    const qs = p.toString();
    const newUrl = qs ? `/wo?${qs}` : "/wo";
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [buildParams]);

  const apiUrl = `/api/wo?${buildParams().toString()}`;

  const { data, error, isLoading } = useSWR(apiUrl, async (url: string) => {
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = "/api/auth/login";
      throw new Error("Unauthenticated");
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
    return { rows: json.data, meta: json.meta } as WoListResponse;
  });

  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setCursor(null);
    setPageOffset(0);
  }, []);

  const updateFilters = useCallback((updates: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
    setCursor(null);
    setPageOffset(0);
  }, []);

  const clearAll = useCallback(() => {
    setFilters({
      status: "", domain: "", q: "", assignedTo: "",
      sourceType: "", dueDateFrom: "", dueDateTo: "",
      sortBy: "createdAt", sortDir: "desc", limit: "25",
    });
    setCursor(null);
    setPageOffset(0);
  }, []);

  const handleNextPage = useCallback(() => {
    if (data?.meta?.nextCursor) {
      setCursor(data.meta.nextCursor);
      setPageOffset((prev) => prev + (data.rows?.length ?? 0));
    }
  }, [data?.meta?.nextCursor, data?.rows?.length]);

  const handleFirstPage = useCallback(() => {
    setCursor(null);
    setPageOffset(0);
  }, []);

  const handleSort = useCallback((key: string) => {
    setFilters((prev) => {
      if (prev.sortBy === key) {
        return { ...prev, sortDir: prev.sortDir === "asc" ? "desc" : "asc" };
      }
      return { ...prev, sortBy: key, sortDir: "asc" };
    });
    setCursor(null);
    setPageOffset(0);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Work Orders</h1>
        {canCreate && (
          <Link
            href="/wo/new"
            className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            New Work Order
          </Link>
        )}
      </div>

      <WoFilterBar
        filters={filters}
        onUpdateFilter={updateFilter}
        onUpdateFilters={updateFilters}
        onClearAll={clearAll}
      />

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
        <WoDataTable
          rows={data.rows as Parameters<typeof WoDataTable>[0]["rows"]}
          meta={data.meta}
          cursor={cursor}
          pageOffset={pageOffset}
          sortBy={filters.sortBy}
          sortDir={filters.sortDir}
          onSort={handleSort}
          onNextPage={handleNextPage}
          onFirstPage={handleFirstPage}
        />
      )}
    </div>
  );
}

export default function WoListPage() {
  return (
    <Suspense>
      <WoListInner />
    </Suspense>
  );
}
