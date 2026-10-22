"use client";

import { useState } from "react";
import { apiPatch, apiPost } from "@/lib/api/fetcher";

interface GanttTask {
  id: string;
  taskNo: number;
  description: string;
  assignedToName: string | null;
  progress: number;
  status: string;
  plannedStart: string | null;
  plannedEnd: string | null;
}

interface Props {
  woId: string;
  tasks: GanttTask[];
  woStart: string;
  dueDate: string | null;
  canEdit: boolean;
  onChanged: () => void;
}

const DAY = 86_400_000;

// Planned dates arrive as "YYYY-MM-DD"; WO created/due dates as Date strings.
// Normalise everything to a UTC-midnight timestamp so day maths is stable.
function toDay(value: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T00:00:00Z`);
  const d = new Date(value);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleDateString("en-MY", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export default function WoGantt({ woId, tasks, woStart, dueDate, canEdit, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = tasks.filter((t) => t.status !== "NA");
  const inactive = tasks.filter((t) => t.status === "NA");
  const scheduled = active.filter((t) => t.plannedStart && t.plannedEnd);
  const unscheduledCount = active.filter((t) => !t.plannedStart && !t.plannedEnd).length;

  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const due = dueDate ? toDay(dueDate) : null;

  const points = [toDay(woStart), today];
  if (due !== null) points.push(due);
  for (const t of scheduled) {
    points.push(toDay(t.plannedStart as string), toDay(t.plannedEnd as string));
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = (max - min) / DAY + 1;
  const pct = (ms: number) => ((ms - min) / DAY / span) * 100;

  const ticks = Array.from({ length: 6 }, (_, i) => min + Math.round(((span - 1) * i) / 5) * DAY);

  async function setDate(taskId: string, field: "plannedStart" | "plannedEnd", value: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPatch(`/api/wo/${woId}/tasks/${taskId}`, { [field]: value || null });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the date");
    } finally {
      setBusy(false);
    }
  }

  async function autoSchedule() {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/wo/${woId}/tasks/auto-schedule`, {});
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-schedule failed");
    } finally {
      setBusy(false);
    }
  }

  if (tasks.length === 0) {
    return <div className="px-4 py-8 text-center text-sm text-gray-400">No tasks yet, so there is nothing to chart</div>;
  }

  const lines = (
    <>
      <div className="pointer-events-none absolute inset-y-0 w-px bg-red-400" style={{ left: `${pct(today)}%` }} />
      {due !== null && (
        <div
          className="pointer-events-none absolute inset-y-0 w-px border-l border-dashed border-gray-500"
          style={{ left: `${pct(due)}%` }}
        />
      )}
    </>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded bg-primary-500" /> Planned</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded bg-green-500" /> Done</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded bg-red-500" /> Past planned end</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-px bg-red-400" /> Today</span>
          {due !== null && (
            <span className="inline-flex items-center gap-1"><span className="h-3 w-px border-l border-dashed border-gray-500" /> Due {fmt(due)}</span>
          )}
        </div>
        {canEdit && unscheduledCount > 0 && (
          <button
            onClick={autoSchedule}
            disabled={busy}
            className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Auto-schedule {unscheduledCount} task{unscheduledCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {error && <p className="px-4 pt-2 text-xs text-red-600">{error}</p>}

      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[320px_1fr] border-b border-gray-100 text-[11px] text-gray-400">
            <div className="px-4 py-1.5">Task</div>
            <div className="relative h-6">
              {ticks.map((t, i) => (
                <span
                  key={i}
                  className="absolute top-1.5 -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${i === 0 ? 3 : i === 5 ? 97 : pct(t)}%` }}
                >
                  {fmt(t)}
                </span>
              ))}
            </div>
          </div>

          {[...active, ...inactive].map((t) => {
            const isNA = t.status === "NA";
            const hasBar = !isNA && t.plannedStart && t.plannedEnd;
            const s = hasBar ? toDay(t.plannedStart as string) : 0;
            const e = hasBar ? toDay(t.plannedEnd as string) : 0;
            const done = t.progress === 100;
            const late = !done && hasBar && e < today;
            const barColor = done ? "bg-green-200" : late ? "bg-red-200" : "bg-primary-200";
            const fillColor = done ? "bg-green-500" : late ? "bg-red-500" : "bg-primary-500";
            return (
              <div key={t.id} className="grid grid-cols-[320px_1fr] border-b border-gray-50">
                <div className={`px-4 py-2 ${isNA ? "opacity-50" : ""}`}>
                  <p className={`truncate text-sm text-gray-800 ${isNA ? "line-through" : ""}`} title={t.description}>
                    <span className="mr-1 text-gray-400">#{t.taskNo}</span>
                    {t.description}
                  </p>
                  {canEdit && !isNA ? (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        type="date"
                        defaultValue={t.plannedStart ?? ""}
                        key={`s-${t.id}-${t.plannedStart}`}
                        onChange={(ev) => setDate(t.id, "plannedStart", ev.target.value)}
                        disabled={busy}
                        aria-label={`Planned start for task ${t.taskNo}`}
                        className="w-[124px] rounded border border-gray-200 px-1 py-0.5 text-xs"
                      />
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="date"
                        defaultValue={t.plannedEnd ?? ""}
                        key={`e-${t.id}-${t.plannedEnd}`}
                        onChange={(ev) => setDate(t.id, "plannedEnd", ev.target.value)}
                        disabled={busy}
                        aria-label={`Planned end for task ${t.taskNo}`}
                        className="w-[124px] rounded border border-gray-200 px-1 py-0.5 text-xs"
                      />
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {isNA ? "Not applicable" : t.assignedToName ?? "Unassigned"}
                    </p>
                  )}
                </div>
                <div className="relative">
                  {lines}
                  {hasBar ? (
                    <div
                      className={`absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded ${barColor}`}
                      style={{ left: `${pct(s)}%`, width: `${Math.max(((e - s) / DAY + 1) / span * 100, 0.8)}%` }}
                      title={`${fmt(s)} to ${fmt(e)} · ${t.progress}%`}
                    >
                      <div className={`h-full ${fillColor}`} style={{ width: `${t.progress}%` }} />
                    </div>
                  ) : (
                    !isNA && (
                      <span className="absolute inset-y-0 left-3 flex items-center text-xs italic text-gray-400">
                        {t.plannedStart || t.plannedEnd ? "Set both dates to draw the bar" : "Unscheduled"}
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
