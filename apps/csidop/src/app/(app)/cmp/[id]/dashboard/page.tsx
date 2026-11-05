"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import "@/components/charts/chart-setup";
import { Doughnut, Line } from "react-chartjs-2";
import type { Plugin } from "chart.js";
import { apiFetcher } from "@/lib/api/fetcher";

const RED = "#ef4444";
const AMBER = "#f59e0b";
const GREEN = "#16a34a";
const BLUE = "#2563eb";
const TRACK = "#F3F4F6";
const CHART_GRID = { color: "#F3F4F6" };
const CHART_NO_GRID = { display: false };

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

interface SCurve {
  planned: { date: string; plannedReadiness: number }[];
  actualToday: { date: string; readiness: number } | null;
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
  const [scurve, setScurve] = useState<SCurve | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetcher<PlanDashboard>(`/api/cmp/plans/${planId}/dashboard`),
      apiFetcher<SCurve>(`/api/cmp/plans/${planId}/scurve`),
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

          {/* Row 1: Scorecard | KPI Gauges | S-Curve */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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

            <Panel title="S-Curve" subtitle="Where we are vs. where the plan says we should be">
              {scurve && scurve.planned.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Overall Progress</span>
                    <RagBadge rag={ragForVariance(dashboard.overallVariance)} />
                  </div>

                  {/* Plan / Actual / Gap read out as numbers, not just a legend --
                      the same three figures the headline banner states in prose,
                      restated here so the chart doesn't need to be "read" to get them. */}
                  <div className="mt-3 grid grid-cols-3 divide-x divide-gray-100 text-center">
                    <div className="px-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Plan (today)</p>
                      <p className="mt-0.5 text-lg font-bold text-gray-500">{(dashboard.overallPlannedReadiness * 100).toFixed(0)}%</p>
                    </div>
                    <div className="px-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Actual (today)</p>
                      <p className="mt-0.5 text-lg font-bold" style={{ color: BLUE }}>{(dashboard.overallReadiness * 100).toFixed(0)}%</p>
                    </div>
                    <div className="px-1">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Gap</p>
                      <p className={`mt-0.5 text-lg font-bold ${varianceColor(dashboard.overallVariance)}`}>
                        {dashboard.overallVariance < 0 ? "−" : dashboard.overallVariance > 0 ? "+" : ""}
                        {Math.round(Math.abs(dashboard.overallVariance) * 100)}
                        <span className="text-xs font-medium"> pts</span>
                      </p>
                      {/* Sign alone reads as ambiguous at a glance (a bare "-1" or "+1"
                          still needs the reader to know which direction is good) --
                          spell out behind/ahead/on schedule too, same words the
                          headline banner and every other variance figure use. */}
                      <p className={`text-[10px] font-medium ${varianceColor(dashboard.overallVariance)}`}>
                        {scheduleWords(dashboard.overallVariance)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 h-[160px]">
                    {(() => {
                      // Place the single real Actual point at the sample date closest to
                      // today -- the first sample on/after today, or the last sample if
                      // today is past the whole plan range (target dates all in the past).
                      // Reused for both the Actual point and the "Today" reference line
                      // below, so both land on the same x position.
                      const idx = scurve.actualToday
                        ? scurve.planned.findIndex((p) => p.date >= scurve.actualToday!.date)
                        : -1;
                      const markerIdx = idx === -1 ? scurve.planned.length - 1 : idx;

                      const todayLinePlugin: Plugin<"line"> = {
                        id: "todayLine",
                        afterDraw(chart) {
                          const xScale = chart.scales.x;
                          const yScale = chart.scales.y;
                          if (!scurve.actualToday || !xScale || !yScale) return;
                          const x = xScale.getPixelForValue(markerIdx);
                          const { top, bottom } = yScale;
                          const ctx = chart.ctx;
                          ctx.save();
                          ctx.beginPath();
                          ctx.setLineDash([3, 3]);
                          ctx.moveTo(x, top);
                          ctx.lineTo(x, bottom);
                          ctx.strokeStyle = "#9CA3AF";
                          ctx.lineWidth = 1;
                          ctx.stroke();
                          ctx.setLineDash([]);
                          ctx.fillStyle = "#6B7280";
                          ctx.font = "9px sans-serif";
                          ctx.textAlign = "center";
                          ctx.fillText("Today", x, top - 3);
                          ctx.restore();
                        },
                      };

                      return (
                        <Line
                          data={{
                            labels: scurve.planned.map((p) => p.date),
                            datasets: [
                              {
                                label: "Plan",
                                data: scurve.planned.map((p) => p.plannedReadiness * 100),
                                borderColor: "#9CA3AF",
                                borderWidth: 2,
                                pointRadius: 0,
                                tension: 0.2,
                              },
                              {
                                label: "Actual",
                                data: scurve.actualToday
                                  ? scurve.planned.map((_, i) => (i === markerIdx ? scurve.actualToday!.readiness * 100 : null))
                                  : scurve.planned.map(() => null),
                                borderColor: BLUE,
                                backgroundColor: BLUE,
                                borderWidth: 0,
                                pointRadius: 6,
                                showLine: false,
                              },
                            ],
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } },
                            scales: {
                              x: { grid: CHART_NO_GRID, ticks: { maxTicksLimit: 6, font: { size: 9 } } },
                              y: { min: 0, max: 100, grid: CHART_GRID, ticks: { font: { size: 9 } } },
                            },
                          }}
                          plugins={[todayLinePlugin]}
                        />
                      );
                    })()}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">
                    Grey line = Plan, the real baseline computed from every item&apos;s own weight and dates. Blue dot = Actual, today&apos;s real reported value.
                    No history is stored yet, so Actual is one honest point, not a full line — it will grow into a real trend as more check-ins happen.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">No baseline dates set on any item yet.</p>
              )}
            </Panel>
          </div>

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
