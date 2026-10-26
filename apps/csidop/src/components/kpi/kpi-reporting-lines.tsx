"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPut } from "@/lib/api/fetcher";

// Immediate superior for each person. The appraisal workflow uses this to
// decide who reviews whom, so it is set here by the HOD, not inferred from roles.

interface Person { staffId: string; name: string; roleCode: string; roleName: string; subTeam: string | null; reportsTo: string | null }
interface Superior { staffId: string; name: string; roleCode: string; roleName: string }
interface Data { staff: Person[]; superiors: Superior[] }

// Which role normally reviews which. Only used to pre-fill empty rows as a
// suggestion; nothing is saved until the HOD presses Save.
const USUAL_SUPERIOR: Record<string, string> = {
  TM: "TL", TL: "SM", BIM_TL: "SM", BIM_MOD: "BIM_TL", SM: "HOD", HOD: "SVP",
};

function suggest(p: Person, data: Data): string | null {
  const wanted = USUAL_SUPERIOR[p.roleCode];
  if (!wanted) return null;
  let pool = data.superiors.filter((s) => s.roleCode === wanted && s.staffId !== p.staffId);
  if (pool.length > 1 && p.subTeam) {
    const samePod = pool.filter((s) => data.staff.find((x) => x.staffId === s.staffId)?.subTeam === p.subTeam);
    if (samePod.length >= 1) pool = samePod;
  }
  return pool.length === 1 ? pool[0].staffId : null;
}

const select = "w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-500";
const btn = "rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40";

export default function KpiReportingLines({ canEdit }: { canEdit: boolean }) {
  const { data, error, mutate } = useSWR<Data>("/api/kpi/reporting-lines", apiFetcher);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(data.staff.map((p) => [p.staffId, p.reportsTo ?? ""])));
  }, [data]);

  if (error) return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>;
  if (!data) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;

  const changes = data.staff
    .filter((p) => (draft[p.staffId] ?? "") !== (p.reportsTo ?? ""))
    .map((p) => ({ staffId: p.staffId, reportsTo: draft[p.staffId] || null }));
  const missing = data.staff.filter((p) => !(draft[p.staffId] ?? "")).length;
  const directReports = new Map<string, number>();
  for (const v of Object.values(draft)) if (v) directReports.set(v, (directReports.get(v) ?? 0) + 1);
  const nameOf = (id: string) => data.superiors.find((s) => s.staffId === id)?.name ?? "";

  function set(id: string, v: string) { setDraft((d) => ({ ...d, [id]: v })); setDone(false); }

  function applySuggestions() {
    setDraft((d) => {
      const next = { ...d };
      for (const p of data!.staff) {
        if (next[p.staffId]) continue;
        const s = suggest(p, data!);
        if (s) next[p.staffId] = s;
      }
      return next;
    });
    setDone(false);
  }

  async function save() {
    setSaving(true); setSaveError(null);
    try {
      const res = await apiPut<Data & { changed: number }>("/api/kpi/reporting-lines", { changes });
      await mutate({ staff: res.staff, superiors: res.superiors }, false);
      setDone(true);
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Failed to save"); } finally { setSaving(false); }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div>
          <p className="text-sm text-gray-700">
            Choose each person&apos;s immediate superior. This is who reviews their appraisal after they fill in their own.
          </p>
          <p className={`mt-1 text-xs ${missing === 0 ? "text-green-700" : "text-amber-700"}`}>
            {missing === 0 ? "Everyone has a superior." : `${missing} of ${data.staff.length} people have no superior yet.`}
          </p>
        </div>
        {canEdit && (
          <button onClick={applySuggestions} disabled={missing === 0} className={btn}>
            Suggest for empty rows
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-5 py-2">Name</th>
              <th className="px-2 py-2">Role</th>
              <th className="px-2 py-2">Pod</th>
              <th className="px-2 py-2">Reports to</th>
              <th className="px-2 py-2 text-right">Direct reports</th>
            </tr>
          </thead>
          <tbody>
            {data.staff.map((p) => (
              <tr key={p.staffId} className="border-b border-gray-50">
                <td className="px-5 py-2 font-medium text-gray-800">{p.name}</td>
                <td className="px-2 py-2 text-gray-600">{p.roleName}</td>
                <td className="px-2 py-2 text-gray-600">{p.subTeam ?? "-"}</td>
                <td className="px-2 py-2">
                  <select
                    value={draft[p.staffId] ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => set(p.staffId, e.target.value)}
                    aria-label={`Reports to for ${p.name}`}
                    className={`${select} ${draft[p.staffId] ? "" : "border-amber-300"}`}
                  >
                    <option value="">Not set</option>
                    {data.superiors.filter((s) => s.staffId !== p.staffId).map((s) => (
                      <option key={s.staffId} value={s.staffId}>{s.name} ({s.roleName})</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2 text-right text-gray-500">{directReports.get(p.staffId) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button onClick={save} disabled={changes.length === 0 || saving} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40">
            {saving ? "Saving…" : `Save${changes.length ? ` ${changes.length} change${changes.length === 1 ? "" : "s"}` : ""}`}
          </button>
          {changes.length === 0 && done && <span className="text-sm text-green-700">Saved.</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
          {changes.length > 0 && !saveError && (
            <span className="text-xs text-gray-500">
              Not saved yet: {changes.slice(0, 3).map((c) => `${data.staff.find((p) => p.staffId === c.staffId)?.name} → ${c.reportsTo ? nameOf(c.reportsTo) : "not set"}`).join("; ")}{changes.length > 3 ? "…" : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
