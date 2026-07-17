"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";
import "@/components/charts/chart-setup";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import AnnouncementBoard from "@/components/announcement-board";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DashboardKpis {
  woOpen: number;
  woInProgress: number;
  woPendingApproval: number;
  woClosed: number;
  woOverdue: number;
  slaAchievement: number;
  activeTenders: number;
  pipelineValue: number;
  wonValue: number;
  winRate: number;
  staffCount: number;
  overloadedCount: number;
  warningCount: number;
  avgUtilization: number;
  csiUtilization: number;
  cmtUtilization: number;
  expiringCerts: number;
  certAchievement: number;
  activeCerts: number;
  totalCertTargets: number;
  criticalSkillCoverage: string;
  singlePointRisks: number;
  oiProgress: string;
}

interface RecentWo {
  id: string;
  csiWoNo: string;
  title: string;
  status: string;
  priority: string;
  assignedToName: string | null;
  updatedAt: string;
}

interface TenderSummary {
  id: string;
  tenderNo: string;
  tenderName: string;
  clientName: string;
  category: string;
  status: string;
  closingDate: string | null;
  estimatedValue: number;
}

interface DashboardData {
  kpis: DashboardKpis;
  recentWos: RecentWo[];
  upcomingTenders: TenderSummary[];
  woByStatus: { status: string; count: number }[];
  tenderByStatus: { status: string; count: number }[];
  woMonthlyTrend: { month: string; opened: number; closed: number }[];
  effortTrend: { month: string; hours: number }[];
  utilTrend: { week: string; csi: number; cmt: number }[];
  staffUtilization: {
    id: string; name: string; roleCode: string; deptCode: string;
    assignedHours: number; capacityHours: number; utilization: number; band: string;
  }[];
  topActiveTenders: TenderSummary[];
  skillDomains: string[];
  skillHeatmap: { staff: string; scores: Record<string, number> }[];
  auditLogCount: number;
  woByRequestType: { month: string; requestType: string; count: number }[];
  taskDurationByDomain: { domain: string; avgDays: number; taskCount: number }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const ACCENT = "#ED1F24";
const BLUE = "#2563eb";
const GREEN = "#16a34a";

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent-200 border-t-accent-600" />
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
      {message}
    </div>
  );
}

function KpiCard({
  label, value, sub, icon, accentBg = "#EEF4FB",
}: {
  label: string; value: string | number; sub?: string;
  icon?: React.ReactNode; accentBg?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        </div>
        {icon && (
          <div className="rounded-lg p-2 shrink-0" style={{ background: accentBg }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

function UtilGauge({ label, value, threshold, color }: {
  label: string; value: number; threshold: number; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <div className="flex items-end gap-2 mb-2">
        <span className="text-2xl font-bold text-gray-900">{value}%</span>
        <span className="text-xs text-gray-400 mb-1">/ {threshold}% threshold</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full">
        <div style={{ width: `${Math.min(value, 100)}%`, background: color }} className="h-2 rounded-full transition-all" />
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700",
  InProgress: "bg-amber-100 text-amber-700",
  PendingApproval: "bg-purple-100 text-purple-700",
  Closed: "bg-gray-100 text-gray-700",
  Prospect: "bg-gray-100 text-gray-600",
  Qualified: "bg-blue-100 text-blue-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Submitted: "bg-amber-100 text-amber-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  Cancelled: "bg-gray-200 text-gray-500",
  Clarification: "bg-purple-100 text-purple-700",
};

const PIPELINE_COLORS: Record<string, string> = {
  Prospect: "#94a3b8",
  Qualified: "#3b82f6",
  "In Progress": "#f59e0b",
  Submitted: "#8b5cf6",
  Clarification: "#ec4899",
};

const BAND_COLOR: Record<string, string> = {
  Free: "#22c55e",
  Safe: "#3b82f6",
  Warning: "#f59e0b",
  Overloaded: "#ef4444",
};

const BAND_BG: Record<string, string> = {
  Free: "#dcfce7",
  Safe: "#dbeafe",
  Warning: "#fef3c7",
  Overloaded: "#fee2e2",
};

const LEVEL_COLORS = ["#f3f4f6", "#dbeafe", "#93c5fd", "#60a5fa", "#2563eb", "#1e3a8a"];

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000_000) return `RM ${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `RM ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `RM ${(val / 1_000).toFixed(0)}K`;
  return `RM ${val.toFixed(0)}`;
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
}

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── Chart defaults ─────────────────────────────────────────────────────────

const CHART_GRID = { color: "#F3F4F6" };
const CHART_NO_GRID = { display: false };

// ─── Digest Button ──────────────────────────────────────────────────────────

function DigestButton() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function send(period: "daily" | "weekly") {
    setSending(true);
    setResult(null);
    try {
      const res = (await apiPost("/api/digest", { period })) as { sent: number };
      setResult({ ok: true, msg: `Sent ${res.sent} ${period} digest email(s)` });
    } catch {
      setResult({ ok: false, msg: "Failed to send digest" });
    } finally {
      setSending(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  return (
    <div className="relative group">
      <button
        disabled={sending}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        {sending ? "Sending..." : "Send Digest"}
      </button>
      <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50">
        <div className="bg-white rounded-lg border border-gray-200 shadow-lg py-1 w-36">
          <button onClick={() => send("daily")} disabled={sending}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700">
            Daily Summary
          </button>
          <button onClick={() => send("weekly")} disabled={sending}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700">
            Weekly Summary
          </button>
        </div>
      </div>
      {result && (
        <div className={`absolute right-0 top-full mt-1 z-50 rounded-lg px-3 py-1.5 text-xs font-medium shadow-lg whitespace-nowrap ${
          result.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {result.msg}
        </div>
      )}
    </div>
  );
}

// ─── Tab Icons (SVG) ────────────────────────────────────────────────────────

function IconClipboard({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
}
function IconCheck({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}
function IconAlert({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>;
}
function IconTarget({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
}
function IconUsers({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}
function IconAward({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>;
}
function IconShield({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>;
}
function IconBriefcase({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
}
function IconTrending({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>;
}

// ─── Main page ──────────────────────────────────────────────────────────────

const TABS = ["Operations", "Resource", "Business", "Capability", "Governance"] as const;
type Tab = typeof TABS[number];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("Operations");
  const { data: d, error, isLoading } = useSWR<DashboardData>(
    "/api/dashboard",
    apiFetcher,
    { refreshInterval: 60000 }
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load dashboard" />;
  if (!d) return <Spinner />;

  const totalWo = d.kpis.woOpen + d.kpis.woInProgress + d.kpis.woPendingApproval + d.kpis.woClosed;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Executive Dashboard</h1>
          <p className="text-sm text-gray-500">
            Welcome back, {user?.name ?? "User"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(user?.roleCode === "HOD" || user?.roleCode === "SM") && (
            <DigestButton />
          )}
          <p className="text-xs text-gray-400">
            {new Date().toLocaleDateString("en-MY", {
              weekday: "long", day: "numeric", month: "long", year: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Announcement Board */}
      <AnnouncementBoard canPost={user?.roleCode === "HOD" || user?.roleCode === "SM"} />

      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 w-fit shadow-sm">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-accent-500 text-white shadow-sm"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ═══ OPERATIONS TAB ═══ */}
      {tab === "Operations" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Open Work Orders" value={d.kpis.woOpen + d.kpis.woInProgress}
              sub={`${d.kpis.woInProgress} in progress`}
              icon={<IconClipboard className="h-5 w-5 text-blue-600" />} accentBg="#EEF4FB" />
            <KpiCard label="Closed This Month" value={d.kpis.woClosed}
              sub={totalWo > 0 ? `${((d.kpis.woClosed / totalWo) * 100).toFixed(1)}% closure rate` : "—"}
              icon={<IconCheck className="h-5 w-5 text-green-600" />} accentBg="#EAF3DE" />
            <KpiCard label="Overdue WOs" value={d.kpis.woOverdue}
              sub={d.kpis.woOverdue > 0 ? "Action required" : "All on track"}
              icon={<IconAlert className="h-5 w-5 text-red-500" />} accentBg="#FCEBEB" />
            <KpiCard label="SLA Achievement" value={`${d.kpis.slaAchievement}%`}
              sub="Target: ≥ 90%"
              icon={<IconTarget className="h-5 w-5 text-amber-600" />} accentBg="#FEF9EC" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* WO Volume Trend */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">WO Volume — Monthly Trend</h3>
              <div className="h-[220px]">
                <Bar data={{
                  labels: d.woMonthlyTrend.map(t => t.month),
                  datasets: [
                    { label: "Due", data: d.woMonthlyTrend.map(t => t.opened), backgroundColor: "#dbeafe", borderColor: BLUE, borderWidth: 1, borderRadius: 3 },
                    { label: "Closed", data: d.woMonthlyTrend.map(t => t.closed), backgroundColor: GREEN, borderRadius: 3 },
                  ],
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
                  scales: { x: { grid: CHART_NO_GRID }, y: { grid: CHART_GRID, beginAtZero: true } },
                }} />
              </div>
            </div>

            {/* Effort Hours Trend */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Total Effort Hours — YTD</h3>
              <div className="h-[220px]">
                <Line data={{
                  labels: d.effortTrend.map(t => t.month),
                  datasets: [{
                    label: "Hours", data: d.effortTrend.map(t => t.hours),
                    borderColor: ACCENT, backgroundColor: "rgba(237,31,36,0.1)",
                    fill: true, tension: 0.35, borderWidth: 2,
                    pointBackgroundColor: ACCENT, pointRadius: 3,
                  }],
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: { x: { grid: CHART_NO_GRID }, y: { grid: CHART_GRID, beginAtZero: true } },
                }} />
              </div>
            </div>
          </div>

          {/* WO by Request Type */}
          {d.woByRequestType.length > 0 && (() => {
            const months = [...new Set(d.woByRequestType.map(r => r.month))];
            const types = [...new Set(d.woByRequestType.map(r => r.requestType))];
            const TYPE_COLORS = [
              "#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6",
              "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
              "#14b8a6", "#e11d48", "#a855f7",
            ];
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 text-sm mb-4">Monthly WO by Request Type</h3>
                <div className="h-[260px]">
                  <Bar data={{
                    labels: months,
                    datasets: types.map((t, i) => ({
                      label: t,
                      data: months.map(m => {
                        const found = d.woByRequestType.find(r => r.month === m && r.requestType === t);
                        return found?.count ?? 0;
                      }),
                      backgroundColor: TYPE_COLORS[i % TYPE_COLORS.length],
                      borderRadius: 2,
                    })),
                  }} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                      legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 10 } } },
                    },
                    scales: {
                      x: { stacked: true, grid: CHART_NO_GRID },
                      y: { stacked: true, grid: CHART_GRID, beginAtZero: true },
                    },
                  }} />
                </div>
              </div>
            );
          })()}

          {/* Avg Task Duration by Domain */}
          {d.taskDurationByDomain.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-baseline justify-between mb-4">
                <h3 className="font-semibold text-gray-900 text-sm">Avg Task Duration by Domain</h3>
                <span className="text-xs text-gray-400">days to complete</span>
              </div>
              <div className="h-[220px]">
                <Bar data={{
                  labels: d.taskDurationByDomain.map(t => t.domain),
                  datasets: [{
                    label: "Avg days",
                    data: d.taskDurationByDomain.map(t => t.avgDays),
                    backgroundColor: BLUE,
                    borderRadius: 3,
                  }],
                }} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const row = d.taskDurationByDomain[ctx.dataIndex];
                          return `${row.avgDays}d avg (${row.taskCount} tasks)`;
                        },
                      },
                    },
                  },
                  scales: { x: { grid: CHART_NO_GRID }, y: { grid: CHART_GRID, beginAtZero: true } },
                }} />
              </div>
            </div>
          )}

          {/* Recent WOs + WO by Status */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">Recent Work Orders</h3>
                <Link href="/wo" className="text-xs font-medium text-accent-600 hover:text-accent-700">View all →</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {d.recentWos.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-500">No work orders yet</div>
                ) : d.recentWos.slice(0, 6).map(wo => (
                  <Link key={wo.id} href={`/wo/${wo.id}`} className="block px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{wo.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono text-gray-400">{wo.csiWoNo}</span>
                          <Badge className={STATUS_COLORS[wo.status] ?? "bg-gray-100 text-gray-700"}>{wo.status}</Badge>
                        </div>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{timeAgo(wo.updatedAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">WO Status Distribution</h3>
              <div className="space-y-3">
                {d.woByStatus.map(item => {
                  const maxCount = Math.max(...d.woByStatus.map(i => i.count), 1);
                  const pct = (item.count / maxCount) * 100;
                  return (
                    <div key={item.status} className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
                        <Badge className={STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-700"}>
                          {item.status === "InProgress" ? "In Progress" : item.status === "PendingApproval" ? "Pending" : item.status}
                        </Badge>
                      </div>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div className="h-full rounded-full bg-navy-600 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-gray-700 w-8 text-right">{item.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ RESOURCE TAB ═══ */}
      {tab === "Resource" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <UtilGauge label="CSI Utilization" value={d.kpis.csiUtilization} threshold={85} color={GREEN} />
            <UtilGauge label="CMT Utilization" value={d.kpis.cmtUtilization} threshold={80} color={BLUE} />
            <KpiCard label="Overloaded Staff" value={d.kpis.overloadedCount}
              sub={d.staffUtilization.filter(s => s.band === "Overloaded").map(s => s.name.split(" ")[0]).join(", ") || "None"}
              icon={<IconAlert className="h-5 w-5 text-red-500" />} accentBg="#FCEBEB" />
            <KpiCard label="Available Capacity" value={`${Math.max(0, 100 - d.kpis.avgUtilization)}%`}
              sub={`Equiv: ${((d.kpis.staffCount * (100 - d.kpis.avgUtilization)) / 100).toFixed(1)} FTE`}
              icon={<IconUsers className="h-5 w-5 text-gray-500" />} accentBg="#F9FAFB" />
          </div>

          {/* Utilization Trend */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 text-sm mb-4">Department Utilization — 6-Week Trend</h3>
            <div className="h-[250px]">
              <Line data={{
                labels: d.utilTrend.map(t => t.week),
                datasets: [
                  { label: "CSI", data: d.utilTrend.map(t => t.csi), borderColor: ACCENT, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: ACCENT, tension: 0.3 },
                  { label: "CMT", data: d.utilTrend.map(t => t.cmt), borderColor: BLUE, borderWidth: 2.5, pointRadius: 4, pointBackgroundColor: BLUE, borderDash: [5, 5], tension: 0.3 },
                ],
              }} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
                scales: { x: { grid: CHART_NO_GRID }, y: { min: 0, max: 100, grid: CHART_GRID } },
              }} />
            </div>
          </div>

          {/* Staff Utilization Table */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 text-sm">Staff Utilization</h3>
              <Link href="/capacity" className="text-xs font-medium text-accent-600 hover:text-accent-700">Full capacity view →</Link>
            </div>
            <div className="space-y-3">
              {d.staffUtilization.slice(0, 10).map(s => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-700">
                    {s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-gray-900 truncate">{s.name}</p>
                      <span
                        style={{ color: BAND_COLOR[s.band], background: BAND_BG[s.band] }}
                        className="text-xs px-1.5 py-0.5 rounded font-medium"
                      >{s.utilization}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full">
                      <div
                        style={{ width: `${Math.min(s.utilization, 100)}%`, background: BAND_COLOR[s.band] }}
                        className="h-1.5 rounded-full transition-all"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ BUSINESS TAB ═══ */}
      {tab === "Business" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Active Tenders" value={d.kpis.activeTenders}
              sub={`${d.kpis.activeTenders} in pursuit`}
              icon={<IconBriefcase className="h-5 w-5 text-blue-600" />} accentBg="#EEF4FB" />
            <KpiCard label="Pipeline Value" value={formatCurrency(d.kpis.pipelineValue)}
              sub={`Submitted: ${formatCurrency(d.tenderByStatus.find(t => t.status === "Submitted")?.count ? d.kpis.pipelineValue * 0.3 : 0)}`}
              icon={<IconTrending className="h-5 w-5 text-green-600" />} accentBg="#EAF3DE" />
            <KpiCard label="Won Value (YTD)" value={formatCurrency(d.kpis.wonValue)}
              icon={<IconAward className="h-5 w-5 text-amber-600" />} accentBg="#FEF9EC" />
            <KpiCard label="OI Progress" value={d.kpis.oiProgress}
              sub="HOD annual target"
              icon={<IconTarget className="h-5 w-5 text-gray-500" />} accentBg="#F9FAFB" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pipeline Doughnut */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Tender Pipeline by Status</h3>
              <div className="h-[250px] flex items-center justify-center">
                {d.tenderByStatus.length === 0 ? (
                  <p className="text-sm text-gray-500">No tender data</p>
                ) : (
                  <Doughnut data={{
                    labels: d.tenderByStatus.map(t => t.status),
                    datasets: [{
                      data: d.tenderByStatus.map(t => t.count),
                      backgroundColor: d.tenderByStatus.map(t => PIPELINE_COLORS[t.status] ?? "#d1d5db"),
                      borderWidth: 2, borderColor: "#FFFFFF",
                    }],
                  }} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                  }} />
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                {d.tenderByStatus.map(t => (
                  <span key={t.status} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span style={{ background: PIPELINE_COLORS[t.status] ?? "#d1d5db" }} className="w-2.5 h-2.5 rounded-sm shrink-0" />
                    {t.status}: {t.count}
                  </span>
                ))}
              </div>
            </div>

            {/* Top Active Tenders */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm mb-1">Top Active Tenders</h3>
              <p className="text-xs text-gray-400 mb-4">By estimated value</p>
              <div className="divide-y divide-gray-50">
                {d.topActiveTenders.map(t => (
                  <Link key={t.id} href={`/tenders/${t.id}`} className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-2 px-2 rounded transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate pr-2">{t.tenderName || t.clientName}</p>
                      <p className="text-xs text-gray-400">{t.clientName}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(t.estimatedValue)}</p>
                      <Badge className={STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-700"}>{t.status}</Badge>
                    </div>
                  </Link>
                ))}
                {d.topActiveTenders.length === 0 && (
                  <p className="py-4 text-sm text-gray-500 text-center">No active tenders</p>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming Tender Deadlines */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">Upcoming Tender Deadlines</h3>
              <Link href="/tenders" className="text-xs font-medium text-accent-600 hover:text-accent-700">View all →</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {d.upcomingTenders.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">No upcoming deadlines</div>
              ) : d.upcomingTenders.map(t => (
                <Link key={t.id} href={`/tenders/${t.id}`} className="block px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.tenderName || t.clientName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono text-gray-400">{t.tenderNo}</span>
                        <Badge className={STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-700"}>{t.status}</Badge>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-700 font-medium">{formatDate(t.closingDate)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatCurrency(t.estimatedValue)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ CAPABILITY TAB ═══ */}
      {tab === "Capability" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Cert Achievement" value={`${d.kpis.certAchievement}%`}
              sub={`${d.kpis.activeCerts} of ${d.kpis.totalCertTargets} active`}
              icon={<IconAward className="h-5 w-5 text-green-600" />} accentBg="#EAF3DE" />
            <KpiCard label="Expiring < 90 Days" value={d.kpis.expiringCerts}
              sub={d.kpis.expiringCerts > 0 ? "Action needed" : "All clear"}
              icon={<IconAlert className="h-5 w-5 text-amber-600" />} accentBg="#FEF9EC" />
            <KpiCard label="Skill Coverage" value={d.kpis.criticalSkillCoverage}
              sub="Domains with staff"
              icon={<IconShield className="h-5 w-5 text-red-500" />} accentBg="#FCEBEB" />
            <KpiCard label="Single-Point Risks" value={d.kpis.singlePointRisks}
              sub="Domains with ≤1 expert"
              icon={<IconAlert className="h-5 w-5 text-red-500" />} accentBg="#FCEBEB" />
          </div>

          {/* Competency Heatmap */}
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 text-sm mb-1">Competency Heatmap</h3>
            <p className="text-xs text-gray-400 mb-4">Technology domain coverage across team</p>
            {d.skillHeatmap.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No skill data available. Add assessments in the Skills module.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr>
                      <th className="text-left text-gray-500 font-medium py-1 pr-4 w-28">Staff</th>
                      {d.skillDomains.map(domain => (
                        <th key={domain} className="text-center text-gray-500 font-medium py-1 px-1 whitespace-nowrap">{domain}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.skillHeatmap.map(row => (
                      <tr key={row.staff}>
                        <td className="text-gray-700 font-medium py-1 pr-4 whitespace-nowrap">{row.staff}</td>
                        {d.skillDomains.map(domain => {
                          const level = row.scores[domain] ?? 0;
                          const labels = ["—", "Nov", "Beg", "Int", "Adv", "Exp"];
                          return (
                            <td key={domain} className="py-1 px-1 text-center">
                              <span
                                style={{ background: LEVEL_COLORS[level], color: level === 0 ? "#D1D5DB" : "#1F2937" }}
                                className="inline-block w-8 h-6 rounded text-xs leading-6 font-medium"
                              >
                                {labels[level]}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center gap-3 mt-4 text-xs text-gray-500">
              <span className="font-medium">Legend:</span>
              {["Novice", "Beginner", "Intermediate", "Advanced", "Expert"].map((lbl, i) => (
                <span key={lbl} className="flex items-center gap-1">
                  <span style={{ background: LEVEL_COLORS[i + 1] }} className="w-3 h-3 rounded" />
                  {lbl}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ GOVERNANCE TAB ═══ */}
      {tab === "Governance" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Open Risks" value={d.kpis.singlePointRisks}
              sub={d.kpis.singlePointRisks > 0 ? "Single-point domain risks" : "None identified"}
              icon={<IconAlert className="h-5 w-5 text-amber-600" />} accentBg="#FEF9EC" />
            <KpiCard label="Overdue WOs" value={d.kpis.woOverdue}
              sub={d.kpis.woOverdue === 0 ? "All resolved" : "Requires attention"}
              icon={<IconCheck className="h-5 w-5 text-green-600" />} accentBg="#EAF3DE" />
            <KpiCard label="Compliance Status" value={d.kpis.slaAchievement >= 90 ? "Green" : d.kpis.slaAchievement >= 75 ? "Amber" : "Red"}
              sub={`SLA: ${d.kpis.slaAchievement}%`}
              icon={<IconShield className="h-5 w-5 text-green-600" />} accentBg="#EAF3DE" />
            <KpiCard label="Audit Log Entries" value={d.auditLogCount.toLocaleString()}
              sub="This month"
              icon={<IconTarget className="h-5 w-5 text-gray-500" />} accentBg="#F9FAFB" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Register */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Active Risk Indicators</h3>
              <div className="space-y-1">
                {d.kpis.overloadedCount > 0 && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-50">
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-red-500" />
                    <p className="text-sm text-gray-700">
                      Resource capacity risk — {d.staffUtilization.filter(s => s.band === "Overloaded").map(s => s.name).join(", ")} at {">"}90% utilization
                    </p>
                  </div>
                )}
                {d.kpis.expiringCerts > 0 && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-50">
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-orange-400" />
                    <p className="text-sm text-gray-700">
                      {d.kpis.expiringCerts} certification(s) expiring within 90 days
                    </p>
                  </div>
                )}
                {d.kpis.woOverdue > 0 && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-50">
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-orange-400" />
                    <p className="text-sm text-gray-700">
                      {d.kpis.woOverdue} work order(s) past due date
                    </p>
                  </div>
                )}
                {d.kpis.singlePointRisks > 0 && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-50">
                    <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-orange-400" />
                    <p className="text-sm text-gray-700">
                      {d.kpis.singlePointRisks} skill domain(s) with single-point-of-failure (≤1 expert)
                    </p>
                  </div>
                )}
                {d.kpis.overloadedCount === 0 && d.kpis.expiringCerts === 0 && d.kpis.woOverdue === 0 && d.kpis.singlePointRisks === 0 && (
                  <p className="text-sm text-gray-500 py-4 text-center">No active risks — all green</p>
                )}
              </div>
            </div>

            {/* Compliance Checklist */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Compliance Checklist</h3>
              <div className="space-y-1">
                {[
                  { label: "SLA achievement ≥ 90%", ok: d.kpis.slaAchievement >= 90 },
                  { label: "No overloaded staff (>90% utilization)", ok: d.kpis.overloadedCount === 0 },
                  { label: "All certifications current", ok: d.kpis.expiringCerts === 0 },
                  { label: "No overdue work orders", ok: d.kpis.woOverdue === 0 },
                  { label: "All skill domains covered (≥2 staff)", ok: d.kpis.singlePointRisks === 0 },
                  { label: "Audit log integrity (immutable)", ok: true },
                ].map((c, i) => (
                  <div key={i} className="flex items-center gap-3 py-2">
                    {c.ok ? (
                      <svg className="h-4 w-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    <p className={`text-sm ${c.ok ? "text-gray-700" : "text-gray-900 font-medium"}`}>{c.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
