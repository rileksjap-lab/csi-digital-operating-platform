"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPut } from "@/lib/api/fetcher";

interface TargetsData {
  period: string;
  metrics: { name: string; description: string }[];
  staff: {
    staffId: string;
    name: string;
    roleCode: string;
    subTeam: string | null;
    targets: Record<string, number>;
  }[];
}

type Grid = Record<string, Record<string, string>>;

export default function KpiTargetsPanel({
  period,
  onClose,
  onSaved,
}: {
  period: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error, isLoading } = useSWR<TargetsData>(`/api/kpi/targets?period=${period}`, apiFetcher);
  const [grid, setGrid] = useState<Grid>({});
  const [original, setOriginal] = useState<Grid>({});
  const [fill, setFill] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const g: Grid = {};
    for (const s of data.staff) {
      g[s.staffId] = {};
      for (const m of data.metrics) {
        const v = s.targets[m.name];
        g[s.staffId][m.name] = v === undefined ? "" : String(v);
      }
    }
    setGrid(g);
    setOriginal(JSON.parse(JSON.stringify(g)));
    setFill({});
  }, [data]);

  if (isLoading) return <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-400">Loading targets…</div>;
  if (error || !data) {
    return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error?.message ?? "Failed to load targets"}</div>;
  }

  function setCell(staffId: string, metric: string, value: string) {
    setGrid((prev) => ({ ...prev, [staffId]: { ...prev[staffId], [metric]: value } }));
  }

  function applyToEveryone(metric: string) {
    const value = fill[metric] ?? "";
    setGrid((prev) => {
      const next: Grid = {};
      for (const id of Object.keys(prev)) next[id] = { ...prev[id], [metric]: value };
      return next;
    });
  }

  const changes: { staffId: string; metricName: string; targetValue: number | null }[] = [];
  let invalid = false;
  for (const s of data.staff) {
    for (const m of data.metrics) {
      const now = (grid[s.staffId]?.[m.name] ?? "").trim();
      const before = (original[s.staffId]?.[m.name] ?? "").trim();
      if (now === before) continue;
      if (now === "") {
        changes.push({ staffId: s.staffId, metricName: m.name, targetValue: null });
      } else {
        const n = Number(now);
        if (!Number.isFinite(n) || n < 0 || n > 100) invalid = true;
        else changes.push({ staffId: s.staffId, metricName: m.name, targetValue: n });
      }
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await apiPut(`/api/kpi/targets`, { period, targets: changes });
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save targets");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Set work performance targets for {period}</h3>
          <p className="text-xs text-gray-500">
            Targets are percentages (0 to 100). Leave a box empty to not measure that person on that KPI.
            Achieved values are calculated by CSIDOP from recorded work.
          </p>
        </div>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-5 py-2 align-bottom">Staff</th>
              {data.metrics.map((m) => (
                <th key={m.name} className="px-2 py-2 align-bottom" title={m.description}>
                  <span className="block font-medium text-gray-700">{m.name}</span>
                  <span className="block max-w-[150px] whitespace-normal font-normal text-[11px] text-gray-400">
                    {m.description}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <td className="px-5 py-2 text-xs font-medium text-gray-500">Same target for everyone</td>
              {data.metrics.map((m) => (
                <td key={m.name} className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min={0} max={100} step={1}
                      value={fill[m.name] ?? ""}
                      onChange={(e) => setFill((p) => ({ ...p, [m.name]: e.target.value }))}
                      aria-label={`Target for everyone: ${m.name}`}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => applyToEveryone(m.name)}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Apply
                    </button>
                  </div>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.staff.map((s) => (
              <tr key={s.staffId} className="border-b border-gray-50">
                <td className="px-5 py-2">
                  <span className="font-medium text-gray-800">{s.name}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {s.roleCode}{s.subTeam ? ` · Pod ${s.subTeam}` : ""}
                  </span>
                </td>
                {data.metrics.map((m) => (
                  <td key={m.name} className="px-2 py-1.5">
                    <input
                      type="number" min={0} max={100} step={1}
                      value={grid[s.staffId]?.[m.name] ?? ""}
                      onChange={(e) => setCell(s.staffId, m.name, e.target.value)}
                      placeholder="—"
                      aria-label={`${s.name} target: ${m.name}`}
                      className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
        <p className="text-xs text-gray-500">
          {invalid
            ? "Each target must be a number from 0 to 100."
            : changes.length === 0
              ? "No changes yet."
              : `${changes.length} change${changes.length === 1 ? "" : "s"} to save`}
          {saveError && <span className="ml-2 text-red-600">{saveError}</span>}
        </p>
        <button
          onClick={save}
          disabled={saving || invalid || changes.length === 0}
          className="rounded bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save targets"}
        </button>
      </div>
    </div>
  );
}
