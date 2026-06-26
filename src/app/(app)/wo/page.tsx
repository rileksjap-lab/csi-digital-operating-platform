"use client";

import { Suspense } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { apiFetcher } from "@/lib/api/fetcher";
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

function WoListInner() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const apiUrl = `/api/wo${queryString ? `?${queryString}` : ""}`;
  const user = useAuthStore((s) => s.user);
  const canCreate = user ? WO_CREATE_ROLES.includes(user.role) : false;

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

      <WoFilterBar />

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
