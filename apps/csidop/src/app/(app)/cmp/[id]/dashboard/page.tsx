"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import "@/components/charts/chart-setup";
import { Doughnut } from "react-chartjs-2";
import { apiFetcher } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";
import SCurvePanel, { type SCurveData } from "@/components/cmp/scurve-panel";

const RED = "#ef4444";
const AMBER = "#f59e0b";
const GREEN = "#16a34a";
const BLUE = "#2563eb";
const TRACK = "#F3F4F6";

type Rag = "Red" | "Amber" | "Green";
const RAG_COLOR: Record<Rag, string> = { Red: RED, Amber: AMBER, Green: GREEN };

interface RagCounts {
  Red: number;
  Amber: number;
  Green: number;
}

interface DashboardWorkstream {
  workstreamId: string;
  workstreamName: string;
  weight: number;
  readiness: number;
  plannedReadiness: number;
  variance: number;
  ragCounts: RagCounts;
  worstRag: Rag;
  blockerIssue: string | null;
  supportRequired: string | null;
}

interface DashboardItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  workstreamName: string;
  score: number;
  rag: Rag;
  variance: number | null;
  criticalGate: boolean;
}

interface PlanDashboard {
  overallReadiness: number;
  overallPlannedReadiness: number;
  overallVariance: number;
  ragCounts: RagCounts;
  dataCompleteness: number;
  workstreams: DashboardWorkstream[];
  redItems: DashboardItem[];
  amberItems: DashboardItem[];
}

interface Issue {
  id: string;
  logCode: string;
  type: "Issue" | "Decision" | "Blocker";
  description: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  ownerRoleTitle: string;
  dueDate: string | null;
  status: string;
  impact: string | null;
  decisionRequired: string | null;
  decisionOwnerRoleTitle: string | null;
}

function scheduleWords(varianceFraction: number): string {
  const points = Math.round(Math.abs(varianceFraction) * 100);
  if (points === 0) return "on schedule";
  return varianceFraction < 0 ? `${points} points behind schedule` : `${points} points ahead of schedule`;
}

function varianceColor(varianceFraction: number): string {
  if (varianceFraction < -0.1) return "text-red-600";
  if (varianceFraction < -0.05) return "text-amber-600";
  return "text-green-600";
}

function ragForVariance(v: number): Rag {
  if (v < -0.1) return "Red";
  if (v < -0.05) return "Amber";
  return "Green";
}

function severityRag(severity: Issue["severity"]): Rag {
  if (severity === "Critical" || severity === "High") return "Red";
  if (severity === "Medium") return "Amber";
  return "Green";
}

function RagDot({ rag }: { rag: Rag }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: RAG_COLOR[rag] }} />;
}

function RagBadge({ rag }: { rag: Rag }) {
  const styles = { Red: "bg-red-100 text-red-700", Amber: "bg-amber-100 text-amber-700", Green: "bg-green-100 text-green-700" };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[rag]}`}>{rag}</span>;
}

/** Panel wrapper matching this app's existing dashboard card convention (see app/(app)/page.tsx). */
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/**
 * Semicircle gauge (Chart.js Doughnut, 180° arc) with a big number overlay.
 * Only ever fed real computed fractions — no fabricated KPIs.
 *
 * Color is passed in by the caller rather than derived from the raw value
 * here. A raw-magnitude threshold (e.g. "red under 40%") reads as a crisis
 * on ANY 5-year plan in its first year, since real progress starts near 0%
 * regardless of whether it's on schedule — that was the previous behavior
 * and it's what made "3% complete" paint red even when the plan is
 * actually on track. Callers now pass the same schedule-variance RAG used
 * everywhere else on this dashboard (or a neutral tone for metrics, like
 * Data Completeness, that aren't a schedule signal at all).
 */
function GaugeChart({ value, label, color, sublabel }: { value: number; label: string; color: string; sublabel?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-[100px] w-[180px]">
        <Doughnut
          data={{ datasets: [{ data: [pct, 100 - pct], backgroundColor: [color, TRACK], borderWidth: 0 }] }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            circumference: 180,
            rotation: 270,
            cutout: "75%",
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-1">
          <span className="text-2xl font-bold text-gray-900">{pct.toFixed(0)}%</span>
        </div>
      </div>
      <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
      {sublabel && <p className="mt-0.5 max-w-[160px] text-center text-[10px] leading-tight text-gray-400">{sublabel}</p>}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Open: "bg-gray-100 text-gray-700",
    "In Progress": "bg-blue-100 text-blue-700",
    Closed: "bg-green-100 text-green-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? "bg-gray-100 text-gray-700"}`}>{status}</span>;
}

export default function CmpDashboardPage() {
  const params = useParams();
  const planId = params.id as string;
  const [dashboard, setDashboard] = useState<PlanDashboard | null>(null);
  const [scurve, setScurve] = useState<SCurveData | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const user = useAuthStore((st) => st.user);
  // Mirrors requireCmpCapability(session, "take_snapshot"), held by HOD only (migration 057).
  // The API is the real enforcement point; this just hides a button that would 403.
  const canSnapshot = user?.role === "HOD";

  const loadScurve = useCallback(() => {
    apiFetcher<SCurveData>(`/api/cmp/plans/${planId}/scurve`).then(setScurve).catch(() => {});
  }, [planId]);

  useEffect(() => {
    Promise.all([
      apiFetcher<PlanDashboard>(`/api/cmp/plans/${planId}/dashboard`),
      apiFetcher<SCurveData>(`/api/cmp/plans/${planId}/scurve`),
      apiFetcher<Issue[]>(`/api/cmp/plans/${planId}/issues`),
    ])
      .then(([d, s, i]) => {
        setDashboard(d);
        setScurve(s);
        setIssues(i);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"));
  }, [planId]);

  const riskRegister = issues?.filter((i) => i.type === "Issue" || i.type === "Blocker") ?? [];
  const actionLog = issues?.filter((i) => i.type === "Decision") ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">CMP Progress Tracking Dashboard</h1>
        <Link href={`/cmp/${planId}`} className="text-sm font-medium text-primary-600 hover:underline">← Back to Plan Setup</Link>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!dashboard && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {dashboard && (
        <>
          {/* Headline */}
          <div className={`rounded-lg border px-5 py-4 ${dashboard.overallVariance < -0.1 ? "border-red-200 bg-red-50" : dashboard.overallVariance < -0.05 ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
            <p className="text-base text-gray-800">
              The transformation program is <span className="font-bold">{(dashboard.overallReadiness * 100).toFixed(0)}% complete</span>,
              against a planned <span className="font-bold">{(dashboard.overallPlannedReadiness * 100).toFixed(0)}%</span> for this point in the 5-year timeline —
              overall, that is{" "}
              <span className={`font-bold ${varianceColor(dashboard.overallVariance)}`}>{scheduleWords(dashboard.overallVariance)}</span>.
            </p>
          </div>

          {/* Row 1: Scorecard | KPI Gauges */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="CMP Scorecard" subtitle="Readiness by workstream">
              <ul className="space-y-2.5">
                {dashboard.workstreams.map((ws) => (
                  <li key={ws.workstreamId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-gray-700">{ws.workstreamName}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-medium text-gray-800">{(ws.readiness * 100).toFixed(0)}%</span>
                      <RagDot rag={ws.worstRag} />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="KPI Dashboard">
              <div className="grid grid-cols-2 gap-2">
                <GaugeChart
                  value={dashboard.overallReadiness}
                  label="Transformation Progress"
                  color={RAG_COLOR[ragForVariance(dashboard.overallVariance)]}
                  sublabel={`% of the plan actually done — ${scheduleWords(dashboard.overallVariance)}`}
                />
                <GaugeChart
                  value={dashboard.dataCompleteness}
                  label="Data Completeness"
                  color={BLUE}
                  sublabel="% of items an owner has entered any real status for"
                />
              </div>
            </Panel>
          </div>

          {/* S-Curve: Baseline vs Forecast vs Actual, by quarter */}
          {scurve && scurve.quarters.length > 0 ? (
            <SCurvePanel planId={planId} scurve={scurve} canSnapshot={canSnapshot} onSnapshotTaken={loadScurve} />
          ) : (
            <Panel title="S-Curve"><p className="text-sm text-gray-400">No baseline dates set on any item yet.</p></Panel>
          )}

          {/* Row 2: Business Unit Tracker */}
          <Panel title="Business Unit Tracker" subtitle="Actual vs planned readiness per workstream">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {dashboard.workstreams.map((ws) => (
                <div key={ws.workstreamId} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-xs font-semibold text-gray-700">{ws.workstreamName}</span>
                    <RagDot rag={ws.worstRag} />
                  </div>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{(ws.readiness * 100).toFixed(0)}%</p>
                  <p className="text-[11px] text-gray-400">
                    Planned {(ws.plannedReadiness * 100).toFixed(0)}% · <span className={varianceColor(ws.variance)}>{scheduleWords(ws.variance)}</span>
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          {/* Row 3: Risk Register | Action Log */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Risk Register" subtitle="Open issues and blockers, from the Issues log">
              {riskRegister.length === 0 ? (
                <p className="text-sm text-gray-400">No issues or blockers logged.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        <th className="py-1.5 pr-2">ID</th>
                        <th className="py-1.5 pr-2">Description</th>
                        <th className="py-1.5 text-right">Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {riskRegister.map((r) => (
                        <tr key={r.id}>
                          <td className="py-1.5 pr-2 font-mono text-[11px] text-gray-400">{r.logCode}</td>
                          <td className="py-1.5 pr-2 text-gray-700">{r.description}{r.status === "Closed" && <span className="ml-1 text-[10px] text-gray-400">(closed)</span>}</td>
                          <td className="py-1.5 text-right"><RagBadge rag={severityRag(r.severity)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel title="Action Log" subtitle="Decisions required, from the Issues log">
              {actionLog.length === 0 ? (
                <p className="text-sm text-gray-400">No decisions logged.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100 text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-gray-400">
                        <th className="py-1.5 pr-2">ID</th>
                        <th className="py-1.5 pr-2">Task</th>
                        <th className="py-1.5 pr-2">Owner</th>
                        <th className="py-1.5 pr-2">Due</th>
                        <th className="py-1.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {actionLog.map((a) => (
                        <tr key={a.id}>
                          <td className="py-1.5 pr-2 font-mono text-[11px] text-gray-400">{a.logCode}</td>
                          <td className="py-1.5 pr-2 text-gray-700">{a.decisionRequired ?? a.description}</td>
                          <td className="py-1.5 pr-2 text-gray-500">{a.decisionOwnerRoleTitle ?? a.ownerRoleTitle}</td>
                          <td className="py-1.5 pr-2 text-gray-500">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : "—"}</td>
                          <td className="py-1.5 text-right"><StatusChip status={a.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          {/* Row 4: Review Cadence + Legend */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Review Cadence">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-900">Monthly CSI Department Review</p>
                  <p className="text-xs text-blue-700">Operational progress</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-sm font-semibold text-blue-900">Quarterly 10CS Management CMP Review</p>
                  <p className="text-xs text-blue-700">Strategic alignment</p>
                </div>
              </div>
            </Panel>

            <Panel title="RAG Status Legend">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5"><RagDot rag="Green" /> On track</span>
                <span className="flex items-center gap-1.5"><RagDot rag="Amber" /> Needs attention</span>
                <span className="flex items-center gap-1.5"><RagDot rag="Red" /> Escalation / management decision required</span>
              </div>
            </Panel>
          </div>

          {/* Item-level drill-down */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-primary-600 hover:underline">
              Item-level detail ({dashboard.redItems.length + dashboard.amberItems.length} items behind schedule or at risk)
            </summary>
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <tbody className="divide-y divide-gray-50">
                  {[...dashboard.redItems, ...dashboard.amberItems].map((it) => (
                    <tr key={it.itemId}>
                      <td className="px-4 py-2">
                        <span className="font-mono text-[11px] text-gray-400">{it.itemCode}</span> <span className="text-gray-800">{it.itemName}</span>
                        {it.criticalGate && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Gate</span>}
                        <p className="text-[11px] text-gray-400">{it.workstreamName}</p>
                      </td>
                      <td className="px-4 py-2 text-right text-sm font-medium text-gray-700">{(it.score * 100).toFixed(0)}%</td>
                      <td className={`px-4 py-2 text-right text-xs ${it.variance != null ? varianceColor(it.variance) : "text-gray-400"}`}>
                        {it.variance != null ? scheduleWords(it.variance) : "no baseline dates set"}
                      </td>
                    </tr>
                  ))}
                  {dashboard.redItems.length === 0 && dashboard.amberItems.length === 0 && (
                    <tr><td className="px-4 py-3 text-sm text-green-700">Nothing behind schedule or at risk right now.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
