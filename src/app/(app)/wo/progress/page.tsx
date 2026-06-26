"use client";

import Link from "next/link";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

interface OverdueItem {
  id: string;
  csiWoNo: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  assignedToName: string | null;
  daysOverdue: number;
}

interface AssigneeRow {
  staffName: string;
  subTeam: string | null;
  total: number;
  open: number;
  inProgress: number;
  closed: number;
  overdue: number;
  effortHours: number;
}

interface PriorityRow {
  priority: string;
  total: number;
  active: number;
  closed: number;
  overdue: number;
}

interface SlaBand {
  band: string;
  count: number;
}

interface RecentItem {
  id: string;
  csiWoNo: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string | null;
  assignedToName: string | null;
}

interface ProgressData {
  overview: {
    total: number;
    open: number;
    inProgress: number;
    pendingApproval: number;
    closed: number;
    onHold: number;
    overdue: number;
    avgResolutionDays: number;
    slaCompliancePct: number;
  };
  overdueItems: OverdueItem[];
  byAssignee: AssigneeRow[];
  byPriority: PriorityRow[];
  slaBands: SlaBand[];
  recentActivity: RecentItem[];
}

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700",
  InProgress: "bg-yellow-100 text-yellow-700",
  PendingApproval: "bg-purple-100 text-purple-700",
  Closed: "bg-gray-100 text-gray-700",
  OnHold: "bg-orange-100 text-orange-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-green-100 text-green-700",
};

const SLA_BAND_COLORS: Record<string, string> = {
  Overdue: "bg-red-500",
  "Due Soon (3d)": "bg-orange-500",
  "Due This Week": "bg-yellow-500",
  "On Track": "bg-green-500",
  "No Due Date": "bg-gray-400",
};

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function KpiCard({ label, value, sub, color = "text-gray-900" }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-gray-100">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function timeAgo(d: string | null): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function WoProgressPage() {
  const { data, error, isLoading } = useSWR<ProgressData>(
    "/api/wo/progress",
    apiFetcher,
    { refreshInterval: 60000 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load progress data
      </div>
    );
  }

  const { overview: o } = data;
  const completionRate = o.total > 0 ? Math.round((o.closed / o.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">WO Progress Monitoring</h1>
          <p className="text-sm text-gray-500">Real-time work order progress and SLA compliance</p>
        </div>
        <Link href="/wo" className="btn-secondary text-sm">View All WOs</Link>
      </div>

      {/* Overview KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Total WOs" value={o.total} />
        <KpiCard label="Active" value={o.open + o.inProgress} color="text-blue-600"
          sub={`${o.open} open, ${o.inProgress} in progress`} />
        <KpiCard label="Overdue" value={o.overdue}
          color={o.overdue > 0 ? "text-red-600" : "text-green-600"}
          sub={o.overdue > 0 ? "Needs attention" : "All on track"} />
        <KpiCard label="Completion Rate" value={`${completionRate}%`}
          sub={`${o.closed} of ${o.total} closed`} />
        <KpiCard label="SLA Compliance" value={`${o.slaCompliancePct}%`}
          color={o.slaCompliancePct >= 90 ? "text-green-600" : o.slaCompliancePct >= 70 ? "text-yellow-600" : "text-red-600"}
          sub={`Avg resolution: ${o.avgResolutionDays}d`} />
      </div>

      {/* Status distribution bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Status Distribution</h3>
        <div className="flex h-6 rounded-full overflow-hidden">
          {[
            { key: "Open", count: o.open, color: "bg-blue-500" },
            { key: "InProgress", count: o.inProgress, color: "bg-yellow-500" },
            { key: "PendingApproval", count: o.pendingApproval, color: "bg-purple-500" },
            { key: "OnHold", count: o.onHold, color: "bg-orange-400" },
            { key: "Closed", count: o.closed, color: "bg-gray-400" },
          ].filter((s) => s.count > 0).map((s) => (
            <div
              key={s.key}
              className={`${s.color} transition-all`}
              style={{ width: `${(s.count / o.total) * 100}%` }}
              title={`${s.key}: ${s.count}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-xs">
          {[
            { label: "Open", count: o.open, color: "bg-blue-500" },
            { label: "In Progress", count: o.inProgress, color: "bg-yellow-500" },
            { label: "Pending Approval", count: o.pendingApproval, color: "bg-purple-500" },
            { label: "On Hold", count: o.onHold, color: "bg-orange-400" },
            { label: "Closed", count: o.closed, color: "bg-gray-400" },
          ].map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-gray-600">
              <span className={`h-2 w-2 rounded-full ${s.color}`} />
              {s.label}: {s.count}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SLA Bands */}
        {data.slaBands.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">SLA Timeline (Active WOs)</h3>
            <div className="space-y-3">
              {data.slaBands.map((band) => (
                <div key={band.band} className="flex items-center gap-3">
                  <span className="w-28 text-xs text-gray-600 shrink-0">{band.band}</span>
                  <div className="flex-1">
                    <ProgressBar
                      value={band.count}
                      max={Math.max(...data.slaBands.map((b) => b.count))}
                      color={SLA_BAND_COLORS[band.band] ?? "bg-gray-400"}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-8 text-right">{band.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Priority */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">By Priority</h3>
          <div className="space-y-3">
            {data.byPriority.map((p) => (
              <div key={p.priority} className="flex items-center gap-3">
                <Badge className={PRIORITY_COLORS[p.priority] ?? "bg-gray-100 text-gray-700"}>
                  {p.priority}
                </Badge>
                <div className="flex-1">
                  <ProgressBar
                    value={p.active}
                    max={p.total}
                    color={p.overdue > 0 ? "bg-red-400" : "bg-blue-400"}
                  />
                </div>
                <span className="text-xs text-gray-500 w-24 text-right">
                  {p.active} active / {p.total} total
                  {p.overdue > 0 && <span className="text-red-600 font-medium"> ({p.overdue} overdue)</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overdue Items */}
      {data.overdueItems.length > 0 && (
        <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-red-100 bg-red-50">
            <h3 className="text-sm font-semibold text-red-800">
              Overdue Work Orders ({data.overdueItems.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100">
            {data.overdueItems.map((item) => (
              <Link
                key={item.id}
                href={`/wo/${item.id}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-red-50/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{item.csiWoNo}</span>
                    <Badge className={PRIORITY_COLORS[item.priority] ?? "bg-gray-100 text-gray-700"}>
                      {item.priority}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate mt-0.5">{item.title}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-red-600">{item.daysOverdue}d overdue</p>
                  <p className="text-xs text-gray-400">{item.assignedToName ?? "Unassigned"}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* By Assignee */}
      {data.byAssignee.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Progress by Assignee</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-5 py-2">Assignee</th>
                  <th className="px-3 py-2">Pod</th>
                  <th className="px-3 py-2 text-center">Total</th>
                  <th className="px-3 py-2 text-center">Open</th>
                  <th className="px-3 py-2 text-center">In Progress</th>
                  <th className="px-3 py-2 text-center">Closed</th>
                  <th className="px-3 py-2 text-center">Overdue</th>
                  <th className="px-3 py-2 text-right">Effort (h)</th>
                  <th className="px-5 py-2">Completion</th>
                </tr>
              </thead>
              <tbody>
                {data.byAssignee.map((a) => {
                  const completePct = a.total > 0 ? Math.round((a.closed / a.total) * 100) : 0;
                  return (
                    <tr key={a.staffName} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-2.5 font-medium text-gray-800">{a.staffName}</td>
                      <td className="px-3 py-2.5 text-gray-500">{a.subTeam ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center text-gray-700">{a.total}</td>
                      <td className="px-3 py-2.5 text-center text-blue-600">{a.open}</td>
                      <td className="px-3 py-2.5 text-center text-yellow-600">{a.inProgress}</td>
                      <td className="px-3 py-2.5 text-center text-gray-600">{a.closed}</td>
                      <td className="px-3 py-2.5 text-center">
                        {a.overdue > 0
                          ? <span className="font-bold text-red-600">{a.overdue}</span>
                          : <span className="text-gray-400">0</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{a.effortHours.toFixed(1)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <ProgressBar value={a.closed} max={a.total} color="bg-green-500" />
                          </div>
                          <span className="text-xs font-medium text-gray-500 w-8">{completePct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-700">Recent Activity</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {data.recentActivity.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No activity yet</div>
          ) : (
            data.recentActivity.map((item) => (
              <Link
                key={item.id}
                href={`/wo/${item.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{item.csiWoNo}</span>
                    <Badge className={STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}>
                      {item.status}
                    </Badge>
                    <Badge className={PRIORITY_COLORS[item.priority] ?? "bg-gray-100 text-gray-700"}>
                      {item.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-700 truncate mt-0.5">{item.title}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{timeAgo(item.updatedAt)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.assignedToName ?? "Unassigned"}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
