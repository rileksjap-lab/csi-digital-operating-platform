"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetcher, apiPut } from "@/lib/api/fetcher";

// "My Updates" -- the owner's view of the plan (tracker v1.3 proposal, change 4).
// Each owner role (New Co Lead, Cloud Lead, ...) owns 18 of the 198 items, so
// this shows only that role's items, one plain question each, grouped by
// readiness factor. Scores, weights and RAG stay behind the scenes; the full
// Progress Update screen is still there for forecast dates and manual scores.
// Same data and save path as Progress Update (GET /plans/:id/items, PUT
// /items/:id/update, then /items/:id/score for that one row).

interface PlanItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  scoringMethod: string;
  criticalGate: boolean;
  evidenceRequired: boolean;
  workstreamName: string;
  factorName: string;
  ownerRoleTitle: string;
  targetDate: string | null;
  currentStatus: string | null;
  approvalStatus: string | null;
  kpiTarget: number | null;
  kpiActual: number | null;
  manualScore: number | null;
  evidenceStatus: string;
  criticalBlocker: boolean;
  score: number;
  rag: "Red" | "Amber" | "Green";
  variance: number | null;
}

type Patch = Partial<Pick<PlanItem, "currentStatus" | "approvalStatus" | "kpiTarget" | "kpiActual" | "evidenceStatus" | "criticalBlocker">>;

// Plain-language answers -> the exact stored statuses calculations.ts scores.
const ANSWERS: Record<string, { field: "currentStatus" | "approvalStatus"; options: { label: string; value: string }[] }> = {
  Binary: {
    field: "currentStatus",
    options: [
      { label: "Not yet", value: "Not Started" },
      { label: "Done", value: "Completed and Verified" },
    ],
  },
  Stage: {
    field: "currentStatus",
    options: [
      { label: "Not started", value: "Not Started" },
      { label: "Started", value: "Started" },
      { label: "Draft done", value: "Draft Completed" },
      { label: "Reviewed", value: "Reviewed" },
      { label: "Approved & evidenced", value: "Approved and Evidenced" },
    ],
  },
  Approval: {
    field: "approvalStatus",
    options: [
      { label: "Not submitted", value: "Not Submitted" },
      { label: "Submitted", value: "Submitted" },
      { label: "Under review", value: "Under Review" },
      { label: "Approved with conditions", value: "Conditional Approval" },
      { label: "Approved", value: "Approved" },
    ],
  },
};

const QUESTION: Record<string, string> = {
  Binary: "Is it done?",
  Stage: "How far has it got?",
  Approval: "Where is the approval?",
  KPI: "What is the number so far?",
};

const PROOF_OPTIONS = [
  { label: "Not yet", value: "Pending" },
  { label: "Submitted", value: "Submitted" },
  { label: "Verified", value: "Verified" },
];

const RAG_WORDS: Record<PlanItem["rag"], { text: string; cls: string }> = {
  Green: { text: "On track", cls: "bg-green-100 text-green-700" },
  Amber: { text: "Needs attention", cls: "bg-amber-100 text-amber-700" },
  Red: { text: "Behind schedule", cls: "bg-red-100 text-red-700" },
};

const OWNER_KEY = (planId: string) => `cmp-my-updates-owner:${planId}`;

function isAnswered(it: PlanItem): boolean {
  return it.currentStatus != null || it.approvalStatus != null || it.kpiActual != null || it.manualScore != null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Segmented({
  options,
  value,
  disabled,
  onPick,
}: {
  options: { label: string; value: string }[];
  value: string | null;
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap overflow-hidden rounded-md border border-gray-300">
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => !selected && onPick(o.value)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${i > 0 ? "border-l border-gray-300" : ""} ${
              selected ? "bg-primary-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function KpiFields({ item, saving, onSave }: { item: PlanItem; saving: boolean; onSave: (patch: Patch) => void }) {
  const [target, setTarget] = useState(item.kpiTarget != null ? String(item.kpiTarget) : "");
  const [actual, setActual] = useState(item.kpiActual != null ? String(item.kpiActual) : "");
  const changed = target !== (item.kpiTarget != null ? String(item.kpiTarget) : "") || actual !== (item.kpiActual != null ? String(item.kpiActual) : "");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label className="block text-[11px] font-medium text-gray-500">Target</label>
        <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} disabled={saving} className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-500">Actual so far</label>
        <input type="number" value={actual} onChange={(e) => setActual(e.target.value)} disabled={saving} className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm" />
      </div>
      <button
        type="button"
        disabled={saving || !changed || target === ""}
        onClick={() => onSave({ kpiTarget: Number(target), ...(actual !== "" ? { kpiActual: Number(actual) } : {}) })}
        className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

function ItemCard({ item, planId, onSaved }: { item: PlanItem; planId: string; onSaved: (itemId: string, patch: Patch) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Patch) {
    setError(null);
    setSaving(true);
    try {
      await apiPut(`/api/cmp/items/${item.itemId}/update`, patch);
      await onSaved(item.itemId, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const answers = ANSWERS[item.scoringMethod];
  const answered = isAnswered(item);
  const status = RAG_WORDS[item.rag];
  // Proof only changes the score for a Stage item at its top step (75% until
  // verified, then 100%), so that's the only place it's asked here -- asking on
  // every item would put back the clutter this view exists to remove.
  const askProof = item.evidenceRequired && item.scoringMethod === "Stage" && item.currentStatus === "Approved and Evidenced";
  const waitingOnProof = askProof && item.evidenceStatus !== "Verified";

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{item.itemName}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Due {formatDate(item.targetDate)}
            {item.criticalGate && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Gate</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saving && <span className="text-[11px] text-gray-400">Saving…</span>}
          <span className="text-sm font-semibold tabular-nums text-gray-800">{(item.score * 100).toFixed(0)}%</span>
          {answered ? (
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.cls}`}>{status.text}</span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">Not answered yet</span>
          )}
        </div>
      </div>

      {error && <div className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-gray-600">{QUESTION[item.scoringMethod] ?? "Update this item"}</p>
        {answers && (
          <Segmented
            options={answers.options}
            value={item[answers.field]}
            disabled={saving}
            onPick={(value) => save(answers.field === "currentStatus" ? { currentStatus: value } : { approvalStatus: value })}
          />
        )}
        {item.scoringMethod === "KPI" && <KpiFields item={item} saving={saving} onSave={save} />}
        {item.scoringMethod === "Manual" && (
          <p className="text-xs text-gray-500">
            This item is scored by hand with a written reason —{" "}
            <Link href={`/cmp/${planId}/progress`} className="font-medium text-primary-600 hover:underline">update it in Progress Update</Link>.
          </p>
        )}

        {askProof && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-gray-600">Proof:</span>
            <Segmented
              options={PROOF_OPTIONS}
              value={PROOF_OPTIONS.some((o) => o.value === item.evidenceStatus) ? item.evidenceStatus : null}
              disabled={saving}
              onPick={(value) => save({ evidenceStatus: value })}
            />
          </div>
        )}
        {waitingOnProof && <p className="text-xs text-amber-700">Counts as 75% until the proof is marked Verified.</p>}

        <label className="flex w-fit items-center gap-2 pt-1 text-xs text-gray-600">
          <input type="checkbox" checked={item.criticalBlocker} disabled={saving} onChange={(e) => save({ criticalBlocker: e.target.checked })} />
          Something is blocking this
        </label>
      </div>
    </li>
  );
}

function Stat({ label, value, sub, tone = "text-gray-900", small = false }: { label: string; value: string; sub?: string; tone?: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 font-bold tabular-nums ${small ? "text-xl" : "text-3xl"} ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function CmpMyUpdatesPage() {
  const params = useParams();
  const planId = params.id as string;
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [owner, setOwner] = useState<string>("");

  useEffect(() => {
    apiFetcher<PlanItem[]>(`/api/cmp/plans/${planId}/items`)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load items"));
  }, [planId]);

  // Items arrive in plan order, so first appearance puts New Co Lead first.
  const owners = useMemo(() => (items ? [...new Set(items.map((it) => it.ownerRoleTitle))] : []), [items]);

  // Remember the viewer's role on this device only (a convenience, not a security boundary).
  useEffect(() => {
    if (!owners.length || owner) return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(OWNER_KEY(planId));
    } catch {
      saved = null;
    }
    setOwner(saved && owners.includes(saved) ? saved : owners[0]);
  }, [owners, owner, planId]);

  function pickOwner(value: string) {
    setOwner(value);
    try {
      window.localStorage.setItem(OWNER_KEY(planId), value);
    } catch {
      // storage unavailable (private window etc.) -- the choice just isn't remembered
    }
  }

  const handleSaved = useCallback(async (itemId: string, patch: Patch) => {
    const score = await apiFetcher<{ score: number; rag: PlanItem["rag"]; variance: number | null }>(`/api/cmp/items/${itemId}/score`);
    setItems((prev) =>
      prev?.map((it) => (it.itemId === itemId ? { ...it, ...patch, score: score.score, rag: score.rag, variance: score.variance } : it)) ?? null
    );
  }, []);

  const mine = useMemo(() => items?.filter((it) => it.ownerRoleTitle === owner) ?? [], [items, owner]);
  const groups = useMemo(() => {
    const byFactor = new Map<string, PlanItem[]>();
    for (const it of mine) byFactor.set(it.factorName, [...(byFactor.get(it.factorName) ?? []), it]);
    return [...byFactor.entries()];
  }, [mine]);

  const answeredCount = mine.filter(isAnswered).length;
  // Same rule as the dashboard: an unanswered item counts as 0%, so it is
  // behind once its own start date has passed.
  const behindCount = mine.filter((it) => it.rag === "Red").length;
  const openWithDates = mine.filter((it) => it.score < 1 && it.targetDate).map((it) => it.targetDate!).sort();
  const nextDue = openWithDates[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">My Updates</h1>
          <p className="mt-0.5 text-sm text-gray-500">Pick your role, then answer each item with what is true today. Scores and colours are worked out for you.</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/cmp/${planId}/dashboard`} className="font-medium text-primary-600 hover:underline">Dashboard</Link>
          <Link href={`/cmp/${planId}`} className="font-medium text-primary-600 hover:underline">← Plan Setup</Link>
        </div>
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

      {items && items.length > 0 && owner && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3">
            <label htmlFor="owner" className="text-sm font-medium text-gray-700">I am the</label>
            <select
              id="owner"
              value={owner}
              onChange={(e) => pickOwner(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-900"
            >
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {mine[0] && <span className="text-sm text-gray-500">· {mine[0].workstreamName}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Your items" value={String(mine.length)} />
            <Stat label="Answered" value={`${answeredCount}/${mine.length}`} sub={answeredCount === mine.length ? "All answered" : `${mine.length - answeredCount} still to answer`} />
            <Stat label="Behind schedule" value={String(behindCount)} sub="unanswered items count as 0%" tone={behindCount > 0 ? "text-red-600" : "text-green-600"} />
            <Stat label="Next due" value={nextDue ? formatDate(nextDue) : "—"} sub="earliest open item" small />
          </div>

          <div className="space-y-5">
            {groups.map(([factor, factorItems]) => (
              <section key={factor}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{factor}</h2>
                <ul className="space-y-2">
                  {factorItems.map((it) => <ItemCard key={it.itemId} item={it} planId={planId} onSaved={handleSaved} />)}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
