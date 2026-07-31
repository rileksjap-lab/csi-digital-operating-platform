"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { apiFetcher } from "@/lib/api/fetcher";

type Period = "today" | "week" | "month";

interface TeamActivityWo {
  id: string;
  csiWoNo: string;
  title: string;
  status: string;
  priority: string;
  progressPercent: number;
}

interface TeamActivityRow {
  staffId: string;
  name: string;
  roleCode: string;
  subTeam: string | null;
  deptCode: string;
  status: string;
  hoursLoggedInPeriod: number;
  currentWos: TeamActivityWo[];
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700",
  InProgress: "bg-amber-100 text-amber-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "text-red-700",
  Urgent: "text-red-600",
  High: "text-orange-600",
  Normal: "text-gray-500",
  Low: "text-gray-400",
};

export default function TeamActivityTab() {
  const [period, setPeriod] = useState<Period>("today");
  const { data, error, isLoading } = useSWR<TeamActivityRow[]>(
    `/api/team-activity?period=${period}`,
    apiFetcher
  );

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
        {error.message}
      </div>
    );
  }
  if (!data) return null;

  const onLeaveCount = data.filter((r) => r.status === "OnLeave").length;
  const idleCount = data.filter((r) => r.status === "Active" && r.currentWos.length === 0).length;
  const totalHours = data.reduce((sum, r) => sum + r.hoursLoggedInPeriod, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md bg-gray-100 p-0.5">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p ? "bg-white text-primary-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">
          {data.length} staff · {totalHours.toFixed(1)}h logged{onLeaveCount > 0 ? ` · ${onLeaveCount} on leave` : ""}{idleCount > 0 ? ` · ${idleCount} with no active WO` : ""}
        </span>
      </div>

      <div className="space-y-2">
        {data.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-gray-400">No staff found</p>
        )}
        {data.map((r) => (
          <div key={r.staffId} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{r.name}</span>
                <span className="text-xs text-gray-400">{r.roleCode} · {r.subTeam ?? "—"}</span>
                {r.status === "OnLeave" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    On Leave
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-gray-600">
                {r.hoursLoggedInPeriod.toFixed(1)}h logged {PERIOD_LABELS[period].toLowerCase()}
              </span>
            </div>

            {r.currentWos.length === 0 ? (
              <p className="mt-2 text-xs italic text-gray-400">No active WO assigned</p>
            ) : (
              <div className="mt-2.5 space-y-1.5">
                {r.currentWos.map((wo) => (
                  <Link
                    key={wo.id}
                    href={`/wo/${wo.id}`}
                    className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-1.5 text-xs hover:bg-gray-100"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-gray-400">{wo.csiWoNo}</span>
                      <span className="truncate text-gray-700">{wo.title}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`font-medium ${PRIORITY_COLORS[wo.priority] ?? "text-gray-500"}`}>{wo.priority}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[wo.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {wo.status}
                      </span>
                      <span className="w-8 text-right text-gray-500">{wo.progressPercent}%</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
