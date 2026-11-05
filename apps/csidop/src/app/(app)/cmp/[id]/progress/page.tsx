"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetcher, apiPut } from "@/lib/api/fetcher";

// UI-level hint mirroring update_item_progress/update_progress/
// manage_workstream_items/manage_hierarchy in migration 038's seed. The API
// (requireCmpCapability) is the real enforcement point; HOD deliberately
// has none of these per the design doc's matrix (HOD locks/approves, does
// not do item-level progress data entry), so the row falls back to
// read-only for HOD without a special-case here -- a 403 on save just
// surfaces as the row's own error message.

// Matches lib/repositories/cmp.repo.ts's PlanItemWithProgress -- one
// consolidated fetch (GET /api/cmp/plans/:id/items) instead of the ~500
// requests this screen used to fire on load (a workstream->initiative->
// factor->item fan-out to build the list, then every row independently
// fetching its own /update + /score). That was genuinely slow on a
// 198-item plan and was part of why the screen felt broken to a new user.
interface PlanItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  scoringMethod: string;
  criticalGate: boolean;
  evidenceRequired: boolean;
  contextLabel: string;
  workstreamName: string;
  currentStatus: string | null;
  approvalStatus: string | null;
  kpiTarget: number | null;
  kpiActual: number | null;
  manualScore: number | null;
  manualScoreJustification: string | null;
  forecastDate: string | null;
  evidenceStatus: string;
  criticalBlocker: boolean;
  score: number;
  rag: "Red" | "Amber" | "Green";
  variance: number | null;
}

const STAGE_STATUSES = ["Not Started", "Started", "Draft Completed", "Reviewed", "Approved and Evidenced"];
const APPROVAL_STATUSES = ["Not Submitted", "Submitted", "Under Review", "Conditional Approval", "Approved"];
const EVIDENCE_STATUSES = ["Not Required", "Pending", "Submitted", "Verified"];

interface ItemUpdatePatch {
  currentStatus?: string;
  approvalStatus?: string;
  kpiTarget?: number;
  kpiActual?: number;
  manualScore?: number;
  manualScoreJustification?: string;
  forecastDate?: string | null;
  evidenceStatus?: string;
  criticalBlocker?: boolean;
}

// Manual scoring requires a justification alongside the score (mirrors
// chk_cmpitemupdates_manualjustification) -- both fields must be sent
// together, so this can't use the same onBlur-per-field pattern as the
// other scoring methods; it needs its own explicit Save action.
function ManualScoreFields({
  initialScore,
  initialJustification,
  saving,
  onSave,
}: {
  initialScore: number | null;
  initialJustification: string | null;
  saving: boolean;
  onSave: (score: number, justification: string) => void;
}) {
  const [score, setScore] = useState(initialScore != null ? String(initialScore * 100) : "");
  const [justification, setJustification] = useState(initialJustification ?? "");

  const canSave = score !== "" && justification.trim().length > 0;

  return (
    <div className="flex items-end gap-2">
      <div>
        <label className="block text-[11px] font-medium text-gray-500">Manual Score %</label>
        <input
          type="number" min={0} max={100}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          disabled={saving}
          className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>
      <div className="min-w-[220px]">
        <label className="block text-[11px] font-medium text-gray-500">Justification <span className="text-red-500">*</span></label>
        <textarea
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          disabled={saving}
          rows={1}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>
      <button
        type="button"
        disabled={saving || !canSave}
        onClick={() => onSave(Number(score) / 100, justification.trim())}
        className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

function RagBadge({ rag }: { rag: PlanItem["rag"] }) {
  const styles = { Red: "bg-red-100 text-red-700", Amber: "bg-amber-100 text-amber-700", Green: "bg-green-100 text-green-700" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[rag]}`}>{rag}</span>;
}

function ProgressRow({ item, onSaved }: { item: PlanItem; onSaved: (itemId: string, patch: ItemUpdatePatch) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function save(patch: ItemUpdatePatch) {
    setError(null);
    setSaving(true);
    try {
      await apiPut(`/api/cmp/items/${item.itemId}/update`, patch);
      await onSaved(item.itemId, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="px-4 py-2 align-top">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-gray-400">{item.itemCode}</span>
            <span className="text-sm text-gray-800">{item.itemName}</span>
            {item.criticalGate && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Gate</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-400">{item.contextLabel}</p>
        </td>
        <td className="px-4 py-2 align-top text-xs text-gray-500">{item.scoringMethod}</td>
        <td className="px-4 py-2 align-top text-sm font-medium text-gray-800">{(item.score * 100).toFixed(0)}%</td>
        <td className="px-4 py-2 align-top"><RagBadge rag={item.rag} /></td>
        <td className="px-4 py-2 align-top text-xs text-primary-600">{expanded ? "Hide" : "Update"}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-gray-50 px-4 py-3" onClick={(e) => e.stopPropagation()}>
            {error && <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
            <div className="flex flex-wrap items-end gap-3">
              {item.scoringMethod === "Stage" && (
                <div>
                  <label className="block text-[11px] font-medium text-gray-500">Status</label>
                  <select
                    defaultValue={item.currentStatus ?? "Not Started"}
                    onChange={(e) => save({ currentStatus: e.target.value })}
                    disabled={saving}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    {STAGE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {item.scoringMethod === "Binary" && (
                <div>
                  <label className="block text-[11px] font-medium text-gray-500">Status</label>
                  <select
                    defaultValue={item.currentStatus ?? "Not Started"}
                    onChange={(e) => save({ currentStatus: e.target.value })}
                    disabled={saving}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="Not Started">Not Completed</option>
                    <option value="Completed and Verified">Completed and Verified</option>
                  </select>
                </div>
              )}
              {item.scoringMethod === "Approval" && (
                <div>
                  <label className="block text-[11px] font-medium text-gray-500">Approval Status</label>
                  <select
                    defaultValue={item.approvalStatus ?? "Not Submitted"}
                    onChange={(e) => save({ approvalStatus: e.target.value })}
                    disabled={saving}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    {APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              {item.scoringMethod === "KPI" && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500">KPI Target</label>
                    <input
                      type="number"
                      defaultValue={item.kpiTarget ?? ""}
                      onBlur={(e) => e.target.value && save({ kpiTarget: Number(e.target.value) })}
                      disabled={saving}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500">KPI Actual</label>
                    <input
                      type="number"
                      defaultValue={item.kpiActual ?? ""}
                      onBlur={(e) => e.target.value && save({ kpiActual: Number(e.target.value) })}
                      disabled={saving}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-xs"
                    />
                  </div>
                </>
              )}
              {item.scoringMethod === "Manual" && (
                <ManualScoreFields
                  initialScore={item.manualScore}
                  initialJustification={item.manualScoreJustification}
                  saving={saving}
                  onSave={(manualScore, manualScoreJustification) => save({ manualScore, manualScoreJustification })}
                />
              )}

              {item.evidenceRequired && (
                <div>
                  <label className="block text-[11px] font-medium text-gray-500">Evidence Status</label>
                  <select
                    defaultValue={item.evidenceStatus}
                    onChange={(e) => save({ evidenceStatus: e.target.value })}
                    disabled={saving}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    {EVIDENCE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-gray-500">Forecast Date</label>
                <input
                  type="date"
                  defaultValue={item.forecastDate ?? ""}
                  onBlur={(e) => save({ forecastDate: e.target.value || null })}
                  disabled={saving}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>

              <label className="flex items-center gap-1 text-[11px] text-gray-600">
                <input
                  type="checkbox"
                  defaultChecked={item.criticalBlocker}
                  onChange={(e) => save({ criticalBlocker: e.target.checked })}
                  disabled={saving}
                />
                Critical Blocker
              </label>

              <div className="ml-auto text-xs text-gray-500">
                Variance: <span className={item.variance != null && item.variance < 0 ? "text-red-600" : "text-green-600"}>
                  {item.variance != null ? `${(item.variance * 100).toFixed(1)}pp` : "—"}
                </span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function CmpProgressPage() {
  const params = useParams();
  const planId = params.id as string;
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workstreamFilter, setWorkstreamFilter] = useState<string>("All");

  const reload = useCallback(() => {
    apiFetcher<PlanItem[]>(`/api/cmp/plans/${planId}/items`)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load items"));
  }, [planId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // A save only needs to refresh that one row's score/RAG, not the whole
  // 198-item list -- re-derive it from the single-item score endpoint and
  // patch it into local state, instead of re-fetching everything.
  const handleSaved = useCallback(async (itemId: string, patch: ItemUpdatePatch) => {
    const score = await apiFetcher<{ score: number; rag: PlanItem["rag"]; variance: number | null }>(`/api/cmp/items/${itemId}/score`);
    setItems((prev) =>
      prev?.map((it) => (it.itemId === itemId ? { ...it, ...patch, score: score.score, rag: score.rag, variance: score.variance } : it)) ?? null
    );
  }, []);

  // Items arrive in plan order (workstream sort_order), so first-appearance
  // order keeps New Co Establishment first, same as Plan Setup and the dashboard.
  const workstreamNames = items ? [...new Set(items.map((it) => it.workstreamName))] : [];
  const filtered = items?.filter((it) => workstreamFilter === "All" || it.workstreamName === workstreamFilter) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Progress Update</h1>
          <p className="mt-0.5 text-sm text-gray-500">Click a row to update status, evidence, and blockers.</p>
        </div>
        <Link href={`/cmp/${planId}`} className="text-sm font-medium text-primary-600 hover:underline">← Back to Plan Setup</Link>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!items && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">
          No tracking items yet — add some from Plan Setup first.
        </div>
      )}

      {items && items.length > 0 && (
        <>
          {workstreamNames.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setWorkstreamFilter("All")}
                className={`rounded-full px-3 py-1 text-xs font-medium ${workstreamFilter === "All" ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                All ({items.length})
              </button>
              {workstreamNames.map((name) => (
                <button
                  key={name}
                  onClick={() => setWorkstreamFilter(name)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${workstreamFilter === name ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tracking Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">RAG</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((item) => <ProgressRow key={item.itemId} item={item} onSaved={handleSaved} />)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
