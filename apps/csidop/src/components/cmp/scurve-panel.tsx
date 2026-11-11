"use client";

import { useState } from "react";
import "@/components/charts/chart-setup";
import { Line } from "react-chartjs-2";
import type { Plugin, TooltipItem } from "chart.js";
import { apiPost } from "@/lib/api/fetcher";

const BASELINE = "#9CA3AF";
const ACTUAL = "#2563eb";
const GATE = "#7c3aed";

export interface SCurveQuarter {
  code: string;
  label: string;
  calendarLabel: string;
  x: number;
  endDate: string;
  baseline: number;
  forecast: number;
}

export interface SCurveActualPoint {
  date: string;
  x: number;
  readiness: number;
  source: "Snapshot" | "Today";
  periodCode: string | null;
  captureSource: "Manual" | "QuarterEnd" | null;
}

export interface SCurveData {
  quarters: SCurveQuarter[];
  actual: SCurveActualPoint[];
  today: { date: string; x: number; baseline: number; forecast: number; readiness: number } | null;
  gate: { periodCode: string; label: string; calendarLabel: string; x: number; date: string; baseline: number; forecast: number } | null;
  snapshots: { periodCode: string; date: string; captureSource: "Manual" | "QuarterEnd" }[];
  currentPeriodCode: string | null;
}

interface Pt {
  x: number;
  y: number;
  note: string;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function gapWords(gap: number): string {
  // Signed, one decimal, same convention as the rest of the dashboard ("−10 pts"): −2.5 pts behind, +1.2 pts ahead.
  const points = Math.abs(gap) * 100;
  if (points < 0.05) return "on the plan";
  return gap < 0 ? `−${points.toFixed(1)} pts behind` : `+${points.toFixed(1)} pts ahead`;
}

function gapColor(gap: number): string {
  // Direction of the gap: red when behind plan, green when on or ahead (same rule as the dashboard headline).
  return gap <= -0.0005 ? "text-red-600" : "text-green-600";
}

export default function SCurvePanel({
  planId, scurve, canSnapshot, onSnapshotTaken,
}: {
  planId: string;
  scurve: SCurveData;
  canSnapshot: boolean;
  onSnapshotTaken: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function takeSnapshot() {
    setBusy(true);
    setMessage(null);
    try {
      const s = await apiPost<{ periodCode: string; replaced: boolean; actualProgress: number }>(`/api/cmp/plans/${planId}/snapshots`, {});
      setMessage({ tone: "ok", text: `${s.replaced ? "Refreshed" : "Saved"} the ${s.periodCode} snapshot at ${pct(s.actualProgress)} actual progress.` });
      onSnapshotTaken();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not take the snapshot" });
    }
    setBusy(false);
  }

  const { quarters, actual, today, gate } = scurve;
  const byX = new Map(quarters.map((q) => [q.x, q]));
  const snapshots = scurve.snapshots;

  const baselineData: Pt[] = quarters.map((q) => ({ x: q.x, y: q.baseline * 100, note: `${q.label} · ${q.calendarLabel}` }));
  const actualData: Pt[] = actual.map((a) => ({
    x: a.x,
    y: a.readiness * 100,
    note: a.source === "Today" ? `Today · ${a.date}` : `${a.periodCode ?? ""} snapshot · ${a.date} (${a.captureSource === "QuarterEnd" ? "quarter-end job" : "taken by HOD"})`,
  }));

  const markersPlugin: Plugin<"line"> = {
    id: "scurveMarkers",
    afterDraw(chart) {
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;
      if (!xScale || !yScale) return;
      const ctx = chart.ctx;
      const vline = (x: number, color: string, label: string, dash: number[], align: CanvasTextAlign, atBottom: boolean) => {
        const px = xScale.getPixelForValue(x);
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash(dash);
        ctx.moveTo(px, yScale.top);
        ctx.lineTo(px, yScale.bottom);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = "600 10px sans-serif";
        ctx.textAlign = align;
        ctx.fillText(label, px + (align === "right" ? -4 : 4), atBottom ? yScale.bottom - 6 : yScale.top + 12);
        ctx.restore();
      };
      if (gate) vline(gate.x, GATE, `${gate.label} · ${gate.calendarLabel}`, [5, 4], "right", true);
      if (today) vline(today.x, "#9CA3AF", "Today", [3, 3], "left", false);
    },
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">S-Curve: Plan vs Actual</h3>
          <p className="mt-0.5 text-xs text-gray-400">Overall CMP readiness by quarter, Y1 Q1 (Q3 2026) to Y5 Q4 (Q2 2031)</p>
        </div>
        {canSnapshot && (
          <button
            onClick={takeSnapshot}
            disabled={busy}
            className="rounded-lg border border-primary-600 bg-primary-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Take snapshot"}
          </button>
        )}
      </div>

      {message && (
        <p className={`mt-3 rounded px-3 py-2 text-sm ${message.tone === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}

      {today && (
        <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 text-center">
          <div className="px-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Plan (today)</p>
            <p className="mt-0.5 text-lg font-bold text-gray-500">{pct(today.baseline)}</p>
          </div>
          <div className="px-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Actual (today)</p>
            <p className="mt-0.5 text-lg font-bold" style={{ color: ACTUAL }}>{pct(today.readiness)}</p>
          </div>
          <div className="px-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Actual vs plan</p>
            <p className={`mt-0.5 text-lg font-bold ${gapColor(today.readiness - today.baseline)}`}>{gapWords(today.readiness - today.baseline)}</p>
          </div>
        </div>
      )}

      <div className="mt-4 h-[300px]">
        <Line
          data={{
            datasets: [
              { label: "Plan", data: baselineData, borderColor: BASELINE, backgroundColor: BASELINE, borderWidth: 3, pointRadius: 2, tension: 0.25, order: 2 },
              {
                label: "Actual", data: actualData, borderColor: ACTUAL, backgroundColor: ACTUAL, borderWidth: 2.5,
                pointRadius: (ctx) => (actual[ctx.dataIndex]?.source === "Today" ? 6 : 4), tension: 0, order: 1,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            parsing: false,
            interaction: { mode: "nearest", intersect: false, axis: "x" },
            plugins: {
              legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
              tooltip: {
                callbacks: {
                  title: (items: TooltipItem<"line">[]) => (items[0]?.raw as Pt | undefined)?.note ?? "",
                  label: (item: TooltipItem<"line">) => `${item.dataset.label}: ${(item.raw as Pt).y.toFixed(1)}%`,
                },
              },
            },
            scales: {
              x: {
                type: "linear", min: 0, max: 20,
                grid: { color: "#F3F4F6" },
                ticks: {
                  stepSize: 1, autoSkip: false, maxRotation: 0, font: { size: 9 },
                  callback: (v) => {
                    const q = byX.get(Number(v));
                    return q ? [q.label.replace(" ", ""), q.calendarLabel.replace(/ 20(\d\d)$/, " '$1")] : "";
                  },
                },
              },
              y: { min: 0, max: 100, grid: { color: "#F3F4F6" }, ticks: { font: { size: 10 }, callback: (v) => `${v}%` } },
            },
          }}
          plugins={[markersPlugin]}
        />
      </div>

      <div className="mt-3 space-y-1 text-[11px] leading-relaxed text-gray-500">
        <p>
          <span className="font-semibold text-gray-600">Plan</span> is the approved baseline, calculated from each item&apos;s weight and dates.{" "}
          <span className="font-semibold text-gray-600">Actual</span> is real history only: one point per quarterly snapshot, plus today&apos;s live value.
        </p>
        {snapshots.length === 0 ? (
          <p>No snapshot has been saved yet, so Actual shows today&apos;s reading only. The quarter-end job and the Take snapshot button build the line from here.</p>
        ) : (
          <p>
            Snapshots: {snapshots.map((s) => `${s.periodCode} (${s.date}${s.captureSource === "QuarterEnd" ? ", auto" : ""})`).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
