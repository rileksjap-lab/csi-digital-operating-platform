"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import type { PaginationMeta } from "@/lib/types/api";
import type { Role } from "@/lib/types/api";
import { useAuthStore } from "@/lib/stores/auth.store";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import WoFilterBar from "@/components/wo/wo-filter-bar";
import WoDataTable from "@/components/wo/wo-data-table";

const WO_CREATE_ROLES: Role[] = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];
const BULK_ACTION_ROLES: Role[] = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

interface StaffOption {
  Id: string;
  Name: string;
  SubTeam: string | null;
  RoleCode: string;
}

interface BulkResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

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
  const canBulkAct = user ? BULK_ACTION_ROLES.includes(user.role) : false;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<"reassign" | "cancel" | null>(null);
  const [bulkStaffId, setBulkStaffId] = useState("");
  const [bulkHours, setBulkHours] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const { data: staffList } = useSWR<StaffOption[]>(canBulkAct ? "/api/staff" : null, apiFetcher);

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

  useEffect(() => {
    setSelectedIds(new Set());
  }, [apiUrl]);

  const { data, error, isLoading, mutate } = useSWR(apiUrl, async (url: string) => {
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = "/api/auth/login";
      throw new Error("Unauthenticated");
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message ?? "Failed to load");
    return { rows: json.data, meta: json.meta } as WoListResponse;
  });

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const rows = (data?.rows as { id: string }[] | undefined) ?? [];
    setSelectedIds((prev) => {
      const allSelected = rows.length > 0 && rows.every((r) => prev.has(r.id));
      if (allSelected) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }, [data?.rows]);

  const closeBulkPanel = useCallback(() => {
    setBulkMode(null);
    setBulkStaffId("");
    setBulkHours("");
    setBulkReason("");
    setBulkError(null);
  }, []);

  const submitBulkAssign = useCallback(async () => {
    if (!bulkStaffId || !bulkHours) {
      setBulkError("Select a staff member and enter hours");
      return;
    }
    setBulkSubmitting(true);
    setBulkError(null);
    try {
      const result = await apiPost<BulkResult>("/api/wo/bulk-assign", {
        ids: Array.from(selectedIds),
        staffId: bulkStaffId,
        assignedHours: Number(bulkHours),
      });
      if (result.failed.length > 0) {
        setBulkError(`${result.succeeded.length} reassigned, ${result.failed.length} failed (e.g. out of scope)`);
      } else {
        closeBulkPanel();
      }
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk reassign failed");
    } finally {
      setBulkSubmitting(false);
    }
  }, [bulkStaffId, bulkHours, selectedIds, mutate, closeBulkPanel]);

  const submitBulkCancel = useCallback(async () => {
    if (!bulkReason.trim()) {
      setBulkError("Cancellation reason is required");
      return;
    }
    setBulkSubmitting(true);
    setBulkError(null);
    try {
      const result = await apiPost<BulkResult>("/api/wo/bulk-cancel", {
        ids: Array.from(selectedIds),
        reason: bulkReason.trim(),
      });
      if (result.failed.length > 0) {
        setBulkError(`${result.succeeded.length} cancelled, ${result.failed.length} failed (e.g. already closed)`);
      } else {
        closeBulkPanel();
      }
      setSelectedIds(new Set());
      mutate();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk cancel failed");
    } finally {
      setBulkSubmitting(false);
    }
  }, [bulkReason, selectedIds, mutate, closeBulkPanel]);

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

      {canBulkAct && selectedIds.size > 0 && (
        <div className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-700">
              {selectedIds.size} selected
            </span>
            <button
              onClick={() => setBulkMode(bulkMode === "reassign" ? null : "reassign")}
              className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              Reassign
            </button>
            <button
              onClick={() => setBulkMode(bulkMode === "cancel" ? null : "cancel")}
              className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Cancel Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear selection
            </button>
          </div>

          {bulkMode === "reassign" && (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-primary-200 pt-3">
              <div>
                <label className="block text-xs font-medium text-gray-600">Assignee</label>
                <select
                  value={bulkStaffId}
                  onChange={(e) => setBulkStaffId(e.target.value)}
                  className="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Select staff...</option>
                  {(staffList ?? []).map((s) => (
                    <option key={s.Id} value={s.Id}>
                      {s.Name} ({s.RoleCode}{s.SubTeam ? ` · Pod ${s.SubTeam}` : ""})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">Assigned Hours</label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={bulkHours}
                  onChange={(e) => setBulkHours(e.target.value)}
                  className="mt-1 block w-24 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  placeholder="e.g. 8"
                />
              </div>
              <button
                onClick={submitBulkAssign}
                disabled={bulkSubmitting}
                className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {bulkSubmitting ? "Reassigning..." : "Confirm Reassign"}
              </button>
              <button
                onClick={closeBulkPanel}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}

          {bulkMode === "cancel" && (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-primary-200 pt-3">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-xs font-medium text-gray-600">Cancellation Reason</label>
                <input
                  type="text"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  maxLength={500}
                  className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  placeholder="Why are these WOs being cancelled?"
                />
              </div>
              <button
                onClick={submitBulkCancel}
                disabled={bulkSubmitting}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bulkSubmitting ? "Cancelling..." : "Confirm Cancel"}
              </button>
              <button
                onClick={closeBulkPanel}
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          )}

          {bulkError && (
            <p className="mt-2 text-xs text-red-600">{bulkError}</p>
          )}
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
          selectable={canBulkAct}
          selectedIds={selectedIds}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
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
