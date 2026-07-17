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

interface PodSummary {
  pod: string;
  counts: Record<Band, number>;
  total: number;
  avgUtilizationPct: number;
}

function buildPodSummaries(staff: StaffUtilization[]): PodSummary[] {
  const groups = new Map<string, StaffUtilization[]>();
  for (const s of staff) {
    const pod = s.subTeam ?? "Unassigned";
    if (!groups.has(pod)) groups.set(pod, []);
    groups.get(pod)!.push(s);
  }
  return Array.from(groups.entries())
    .map(([pod, members]) => {
      const counts: Record<Band, number> = { Free: 0, Safe: 0, Warning: 0, Overloaded: 0 };
      for (const m of members) counts[m.band]++;
      const avgUtilizationPct = Math.round(
        members.reduce((sum, m) => sum + m.utilizationPct, 0) / members.length
      );
      return { pod, counts, total: members.length, avgUtilizationPct };
    })
    .sort((a, b) => a.pod.localeCompare(b.pod));
}

type SortKey =
  | "name" | "roleCode" | "subTeam" | "assignedHoursThisPeriod"
  | "workedHoursThisPeriod" | "remainingCapacityHours" | "utilizationPct" | "openWoCount" | "band";

function sortStaff(list: StaffUtilization[], key: SortKey, dir: "asc" | "desc"): StaffUtilization[] {
  const sorted = [...list].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av ?? "").localeCompare(String(bv ?? ""));
  });
  return dir === "asc" ? sorted : sorted.reverse();
}

export default function CapacityPage() {
  const [bandFilter, setBandFilter] = useState<Band | null>(null);
  const [podFilter, setPodFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const { data, error, isLoading } = useSWR<UtilizationResponse>("/api/capacity", apiFetcher);

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

  const podSummaries = buildPodSummaries(staff);
  const podFiltered = podFilter
    ? staff.filter((s) => (s.subTeam ?? "Unassigned") === podFilter)
    : staff;
  const bandFiltered = bandFilter
    ? podFiltered.filter((s) => s.band === bandFilter)
    : podFiltered;
  const filteredStaff = sortKey ? sortStaff(bandFiltered, sortKey, sortDir) : bandFiltered;

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

      {/* Capacity by Pod */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Capacity by Pod</h2>
          {podFilter && (
            <button
              onClick={() => setPodFilter(null)}
              className="text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              Clear pod filter
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {podSummaries.map((p) => (
            <button
              key={p.pod}
              onClick={() => setPodFilter(podFilter === p.pod ? null : p.pod)}
              className={`rounded-lg border p-4 text-left transition-colors ${
                podFilter === p.pod
                  ? "border-primary-400 bg-primary-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">{p.pod}</span>
                <span className="text-xs text-gray-400">{p.total} staff</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span className="tabular-nums">{p.avgUtilizationPct}% avg</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {BAND_FILTERS.map((b) => (
                  <span
                    key={b}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${BAND_STYLES[b]}`}
                  >
                    {b} {p.counts[b]}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
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
          All ({podFiltered.length})
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
                <SortableTh label="Name" sortKey="name" current={sortKey} dir={sortDir} onClick={handleSortClick} />
                <SortableTh label="Role" sortKey="roleCode" current={sortKey} dir={sortDir} onClick={handleSortClick} />
                <SortableTh label="Sub-Team" sortKey="subTeam" current={sortKey} dir={sortDir} onClick={handleSortClick} />
                <SortableTh label="Assigned (h)" sortKey="assignedHoursThisPeriod" current={sortKey} dir={sortDir} onClick={handleSortClick} align="right" />
                <SortableTh label="Worked (h)" sortKey="workedHoursThisPeriod" current={sortKey} dir={sortDir} onClick={handleSortClick} align="right" />
                <SortableTh label="Remaining (h)" sortKey="remainingCapacityHours" current={sortKey} dir={sortDir} onClick={handleSortClick} align="right" />
                <SortableTh label="Utilization" sortKey="utilizationPct" current={sortKey} dir={sortDir} onClick={handleSortClick} className="w-48" />
                <SortableTh label="Open WOs" sortKey="openWoCount" current={sortKey} dir={sortDir} onClick={handleSortClick} align="center" />
                <SortableTh label="Band" sortKey="band" current={sortKey} dir={sortDir} onClick={handleSortClick} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    No staff found
                  </td>
                </tr>
              )}
              {filteredStaff.map((s) => (
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

function SortableTh({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey | null;
  dir: "asc" | "desc";
  onClick: (key: SortKey) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const isActive = current === sortKey;
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={`px-4 py-3 text-xs font-medium uppercase cursor-pointer select-none hover:text-gray-700 ${
        isActive ? "text-gray-800" : "text-gray-500"
      } ${alignClass} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && <span className="text-primary-600">{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}
