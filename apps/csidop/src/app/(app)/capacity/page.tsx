"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

type Band = "Free" | "Safe" | "Warning" | "Overloaded";

interface StaffUtilization {
  staffId: string;
  name: string;
  roleCode: string;
  subTeam: string | null;
  deptCode: string;
  dailyUsableHours: number;
  assignedHoursThisPeriod: number;
  workedHoursThisPeriod: number;
  remainingCapacityHours: number;
  utilizationPct: number;
  band: Band;
  openWoCount: number;
}

interface DepartmentSummary {
  csiUtilization: number;
  cmtUtilization: number;
  csiThreshold: number;
  cmtThreshold: number;
  csiStatus: Band;
  cmtStatus: Band;
}

interface UtilizationResponse {
  departmentSummary: DepartmentSummary;
  staff: StaffUtilization[];
  cacheTimestamp: string;
}

const BAND_STYLES: Record<Band, string> = {
  Free: "bg-green-100 text-green-700",
  Safe: "bg-blue-100 text-blue-700",
  Warning: "bg-yellow-100 text-yellow-700",
  Overloaded: "bg-red-100 text-red-700",
};

const BAND_BAR: Record<Band, string> = {
  Free: "bg-green-500",
  Safe: "bg-blue-500",
  Warning: "bg-yellow-500",
  Overloaded: "bg-red-500",
};

const BAND_FILTERS: Band[] = ["Free", "Safe", "Warning", "Overloaded"];

export default function CapacityPage() {
  const [bandFilter, setBandFilter] = useState<Band | null>(null);

  const url = bandFilter
    ? `/api/capacity?band=${bandFilter}`
    : "/api/capacity";

  const { data, error, isLoading } = useSWR<UtilizationResponse>(url, apiFetcher);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error?.message ?? "Failed to load capacity data"}
      </div>
    );
  }

  if (!data) return null;

  const { departmentSummary: ds, staff, cacheTimestamp } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">
          Capacity Dashboard
        </h1>
        <span className="text-xs text-gray-400">
          Updated {new Date(cacheTimestamp).toLocaleTimeString("en-MY")}
        </span>
      </div>

      {/* Department summary gauge — CSI only (CMT module not yet built) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <GaugeCard
          label="CSI Utilization"
          pct={ds.csiUtilization}
          threshold={ds.csiThreshold}
          band={ds.csiStatus}
        />
      </div>

      {/* Band filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setBandFilter(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            bandFilter === null
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All ({staff.length})
        </button>
        {BAND_FILTERS.map((b) => (
          <button
            key={b}
            onClick={() => setBandFilter(bandFilter === b ? null : b)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              bandFilter === b
                ? "bg-gray-800 text-white"
                : `${BAND_STYLES[b]} hover:opacity-80`
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Staff utilization table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Sub-Team</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Assigned (h)</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Worked (h)</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-right">Remaining (h)</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase w-48">Utilization</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase text-center">Open WOs</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    No staff found
                  </td>
                </tr>
              )}
              {staff.map((s) => (
                <tr key={s.staffId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.roleCode}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.subTeam ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {s.assignedHoursThisPeriod.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {s.workedHoursThisPeriod.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {s.remainingCapacityHours.toFixed(1)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-gray-200">
                        <div
                          className={`h-full rounded-full ${BAND_BAR[s.band]}`}
                          style={{ width: `${Math.min(s.utilizationPct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-gray-600 w-8 text-right">
                        {s.utilizationPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums text-gray-600">
                    {s.openWoCount}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BAND_STYLES[s.band]}`}>
                      {s.band}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GaugeCard({
  label,
  pct,
  threshold,
  band,
}: {
  label: string;
  pct: number;
  threshold: number;
  band: Band;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BAND_STYLES[band]}`}>
          {band}
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="text-3xl font-bold tabular-nums text-gray-800">{pct}%</span>
        <span className="mb-1 text-xs text-gray-400">/ {threshold}% threshold</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${BAND_BAR[band]}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
