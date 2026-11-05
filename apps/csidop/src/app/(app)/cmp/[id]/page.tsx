"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";

// UI-level hints mirroring migration 039's seed (HOD given unrestricted
// access to every CMP capability, superseding 038's stricter SM/HOD
// split -- see docs/cmp-transformation/10_solution_design.md section 2).
// The API (requireCmpCapability) is the real enforcement point -- these
// just avoid showing controls that would 403 anyway.
const MANAGE_ROLES = ["SolutionManager", "HOD"];
const LOCK_ROLES = ["HOD"];
const APPROVE_ROLES = ["HOD"];

// ─── Types (mirror the JSON shape from lib/repositories/cmp.repo.ts) ─────

interface Plan {
  id: string;
  planCode: string;
  name: string;
  baselineStatus: "Draft" | "Locked" | "Approved";
}

interface Item {
  id: string;
  itemCode: string;
  name: string;
  weight: number;
  scoringMethod: string;
  criticalGate: boolean;
  evidenceRequired: boolean;
}

interface Factor {
  id: string;
  code: string;
  name: string;
  weight: number;
  items: Item[];
}

interface Initiative {
  id: string;
  code: string;
  name: string;
  weight: number;
  factors: Factor[];
}

interface Workstream {
  id: string;
  code: string;
  name: string;
  weight: number;
  status: "Draft" | "Active";
  initiatives: Initiative[];
}

interface WeightGroup {
  level: "workstream" | "initiative" | "factor" | "item";
  parentId: string;
  parentLabel: string;
  total: number;
  valid: boolean;
  siblingCount: number;
}

interface Validation {
  valid: boolean;
  groups: WeightGroup[];
}

async function loadTree(planId: string): Promise<Workstream[]> {
  const workstreams = await apiFetcher<Workstream[]>(`/api/cmp/plans/${planId}/workstreams`);
  return Promise.all(
    workstreams.map(async (ws) => {
      const initiatives = await apiFetcher<Initiative[]>(`/api/cmp/workstreams/${ws.id}/initiatives`);
      const initiativesWithChildren = await Promise.all(
        initiatives.map(async (init) => {
          const factors = await apiFetcher<Factor[]>(`/api/cmp/initiatives/${init.id}/factors`);
          const factorsWithItems = await Promise.all(
            factors.map(async (f) => {
              const items = await apiFetcher<Item[]>(`/api/cmp/factors/${f.id}/items`);
              return { ...f, items };
            })
          );
          return { ...init, factors: factorsWithItems };
        })
      );
      return { ...ws, initiatives: initiativesWithChildren };
    })
  );
}

function WeightPill({ group }: { group?: WeightGroup }) {
  if (!group) return null;
  const pct = (group.total * 100).toFixed(1);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        group.valid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}
      title={group.valid ? "Siblings sum to 100%" : `Siblings sum to ${pct}%, must equal 100%`}
    >
      {group.valid ? "✓" : "✗"} {pct}%
    </span>
  );
}

// ─── Generic add-node form (workstream / initiative / factor share this shape) ─

interface NodeFormValues {
  code: string;
  name: string;
  weight: string;
  sortOrder: string;
}

function AddNodeForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (values: NodeFormValues) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [values, setValues] = useState<NodeFormValues>({ code: "", name: "", weight: "", sortOrder: "0" });
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit(values);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save");
        }
      }}
      className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-gray-50 p-2"
    >
      {error && <div className="w-full text-xs text-red-600">{error}</div>}
      <div>
        <label className="block text-[11px] font-medium text-gray-500">Code</label>
        <input
          required
          value={values.code}
          onChange={(e) => setValues((v) => ({ ...v, code: e.target.value }))}
          className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="block text-[11px] font-medium text-gray-500">Name</label>
        <input
          required
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-500">Weight %</label>
        <input
          required
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={values.weight}
          onChange={(e) => setValues((v) => ({ ...v, weight: e.target.value }))}
          className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {submitting ? "Saving..." : "Add"}
      </button>
      <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">
        Cancel
      </button>
    </form>
  );
}

const SCORING_METHODS = ["Stage", "Binary", "Approval", "KPI", "Manual"];

function AddItemForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [itemCode, setItemCode] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [scoringMethod, setScoringMethod] = useState("Stage");
  const [ownerRoleTitle, setOwnerRoleTitle] = useState("");
  const [criticalGate, setCriticalGate] = useState(false);
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit({
            itemCode,
            name,
            weight: Number(weight) / 100,
            scoringMethod,
            ownerRoleTitle,
            criticalGate,
            evidenceRequired,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save");
        }
      }}
      className="flex flex-wrap items-end gap-2 rounded border border-gray-200 bg-gray-50 p-2"
    >
      {error && <div className="w-full text-xs text-red-600">{error}</div>}
      <div>
        <label className="block text-[11px] font-medium text-gray-500">Item Code</label>
        <input required value={itemCode} onChange={(e) => setItemCode(e.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-xs" />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="block text-[11px] font-medium text-gray-500">Tracking Item</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-500">Weight %</label>
        <input required type="number" min={0} max={100} step="0.01" value={weight} onChange={(e) => setWeight(e.target.value)} className="w-16 rounded border border-gray-300 px-2 py-1 text-xs" />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-500">Scoring Method</label>
        <select value={scoringMethod} onChange={(e) => setScoringMethod(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-xs">
          {SCORING_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="min-w-[120px]">
        <label className="block text-[11px] font-medium text-gray-500">Owner Role</label>
        <input required value={ownerRoleTitle} onChange={(e) => setOwnerRoleTitle(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
      </div>
      <label className="flex items-center gap-1 text-[11px] text-gray-600">
        <input type="checkbox" checked={criticalGate} onChange={(e) => setCriticalGate(e.target.checked)} /> Critical Gate
      </label>
      <label className="flex items-center gap-1 text-[11px] text-gray-600">
        <input type="checkbox" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} /> Evidence Req.
      </label>
      <button type="submit" disabled={submitting} className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50">
        {submitting ? "Saving..." : "Add"}
      </button>
      <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">
        Cancel
      </button>
    </form>
  );
}

export default function CmpPlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;
  const user = useAuthStore((s) => s.user);
  const canManage = user ? MANAGE_ROLES.includes(user.role) : false;
  const canLock = user ? LOCK_ROLES.includes(user.role) : false;
  const canApprove = user ? APPROVE_ROLES.includes(user.role) : false;

  const [plan, setPlan] = useState<Plan | null>(null);
  const [tree, setTree] = useState<Workstream[] | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // "which add-form is open" keyed by e.g. "workstream", "initiative:<wsId>", "factor:<initId>", "item:<factorId>"
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [planData, treeData, validationData] = await Promise.all([
        apiFetcher<Plan>(`/api/cmp/plans/${planId}`),
        loadTree(planId),
        apiPost<Validation>(`/api/cmp/plans/${planId}/baseline/validate`, {}),
      ]);
      setPlan(planData);
      setTree(treeData);
      setValidation(validationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    reload();
  }, [reload]);

  function groupFor(level: WeightGroup["level"], parentId: string): WeightGroup | undefined {
    return validation?.groups.find((g) => g.level === level && g.parentId === parentId);
  }

  async function handleLock() {
    setActionError(null);
    setActionBusy(true);
    try {
      await apiPost(`/api/cmp/plans/${planId}/baseline/lock`, {});
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to lock baseline");
    } finally {
      setActionBusy(false);
    }
  }

  async function handleApprove() {
    setActionError(null);
    setActionBusy(true);
    try {
      await apiPost(`/api/cmp/plans/${planId}/baseline/approve`, {});
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to approve baseline");
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !plan) {
    return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error ?? "Plan not found"}</div>;
  }

  const overallGroup = validation?.groups.find((g) => g.level === "workstream" && g.parentId === planId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-800">{plan.name}</h1>
            <span className="text-sm text-gray-400">{plan.planCode}</span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">Baseline status: <span className="font-medium">{plan.baselineStatus}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/cmp/${planId}/my-updates`} className="rounded bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
            My Updates →
          </Link>
          <Link href={`/cmp/${planId}/dashboard`} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Dashboard →
          </Link>
          <Link href={`/cmp/${planId}/progress`} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Progress Update →
          </Link>
          <Link href={`/cmp/${planId}/issues`} className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Issues →
          </Link>
          {plan.baselineStatus === "Draft" && canLock && (
            <button onClick={handleLock} disabled={actionBusy || !validation?.valid} title={!validation?.valid ? "Weights must all be valid first" : ""} className="rounded bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
              Lock Baseline
            </button>
          )}
          {plan.baselineStatus === "Locked" && canApprove && (
            <button onClick={handleApprove} disabled={actionBusy} className="rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              Approve Baseline
            </button>
          )}
        </div>
      </div>

      {actionError && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      {validation && (
        <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${validation.valid ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {validation.valid
            ? "✓ All sibling weights total 100% at every level. Ready for baseline lock."
            : `✗ ${validation.groups.filter((g) => !g.valid).length} sibling group(s) do not total 100% — baseline approval is blocked (TC01).`}
          {overallGroup && <WeightPill group={overallGroup} />}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Workstreams</h2>
          {canManage && plan.baselineStatus === "Draft" && (
            <button onClick={() => setOpenForm(openForm === "workstream" ? null : "workstream")} className="text-xs font-medium text-primary-600 hover:underline">
              + Add Workstream
            </button>
          )}
        </div>

        {openForm === "workstream" && (
          <div className="mb-3">
            <AddNodeForm
              submitting={formBusy}
              onCancel={() => setOpenForm(null)}
              onSubmit={async (values) => {
                setFormBusy(true);
                try {
                  await apiPost(`/api/cmp/plans/${planId}/workstreams`, {
                    code: values.code,
                    name: values.name,
                    weight: Number(values.weight) / 100,
                    sortOrder: Number(values.sortOrder) || 0,
                  });
                  setOpenForm(null);
                  await reload();
                } finally {
                  setFormBusy(false);
                }
              }}
            />
          </div>
        )}

        {tree && tree.length === 0 && <p className="py-6 text-center text-sm text-gray-400">No workstreams yet.</p>}

        <div className="space-y-3">
          {tree?.map((ws) => (
            <div key={ws.id} className="rounded border border-gray-200">
              <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">{ws.code}</span>
                  <span className="text-sm font-medium text-gray-800">{ws.name}</span>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] text-gray-600">{ws.status}</span>
                </div>
                <WeightPill group={groupFor("workstream", planId)} />
              </div>

              <div className="px-3 py-2 space-y-2">
                {ws.initiatives.length <= 1
                  ? renderFactors(ws, ws.initiatives[0] ?? null)
                  : ws.initiatives.map((init) => (
                      // Pre-v1.3 plans with several initiatives in one workstream still show the level.
                      <div key={init.id} className="ml-3 rounded border border-gray-100">
                        <div className="flex items-center justify-between bg-gray-50/60 px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-gray-400">{init.code}</span>
                            <span className="text-sm text-gray-700">{init.name}</span>
                          </div>
                          <WeightPill group={groupFor("initiative", ws.id)} />
                        </div>
                        <div className="px-3 py-2 space-y-2">{renderFactors(ws, init)}</div>
                      </div>
                    ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Tracker v1.3 dropped the Initiative level: every workstream has exactly one
  // initiative at 100%, so it is hidden and factors sit directly under the
  // workstream. The initiative row still exists in the DB (rollups go through it);
  // a new workstream gets it created on its first factor.
  function renderFactors(ws: Workstream, init: Initiative | null) {
    const formKey = `factor:${init?.id ?? ws.id}`;
    return (
      <>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Readiness Factors</p>
                        {canManage && plan!.baselineStatus === "Draft" && (
                          <button onClick={() => setOpenForm(openForm === formKey ? null : formKey)} className="text-xs font-medium text-primary-600 hover:underline">
                            + Add Factor
                          </button>
                        )}
                      </div>

                      {openForm === formKey && (
                        <AddNodeForm
                          submitting={formBusy}
                          onCancel={() => setOpenForm(null)}
                          onSubmit={async (values) => {
                            setFormBusy(true);
                            try {
                              const initiativeId =
                                init?.id ??
                                (
                                  await apiPost<{ id: string }>(`/api/cmp/workstreams/${ws.id}/initiatives`, {
                                    code: `${ws.code}-I`.slice(0, 20),
                                    name: ws.name,
                                    weight: 1,
                                    sortOrder: 0,
                                  })
                                ).id;
                              await apiPost(`/api/cmp/initiatives/${initiativeId}/factors`, {
                                code: values.code,
                                name: values.name,
                                weight: Number(values.weight) / 100,
                                sortOrder: Number(values.sortOrder) || 0,
                              });
                              setOpenForm(null);
                              await reload();
                            } finally {
                              setFormBusy(false);
                            }
                          }}
                        />
                      )}

                      {(!init || init.factors.length === 0) && <p className="ml-3 text-xs text-gray-400">No readiness factors yet.</p>}

                      {init?.factors.map((f) => (
                        <div key={f.id} className="ml-3 rounded border border-gray-100">
                          <div className="flex items-center justify-between bg-gray-50/40 px-3 py-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-mono text-gray-400">{f.code}</span>
                              <span className="text-sm text-gray-700">{f.name}</span>
                            </div>
                            <WeightPill group={groupFor("factor", init!.id)} />
                          </div>

                          <div className="px-3 py-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tracking Items</p>
                              {canManage && plan!.baselineStatus === "Draft" && (
                                <button onClick={() => setOpenForm(openForm === `item:${f.id}` ? null : `item:${f.id}`)} className="text-xs font-medium text-primary-600 hover:underline">
                                  + Add Item
                                </button>
                              )}
                            </div>

                            {openForm === `item:${f.id}` && (
                              <AddItemForm
                                submitting={formBusy}
                                onCancel={() => setOpenForm(null)}
                                onSubmit={async (values) => {
                                  setFormBusy(true);
                                  try {
                                    await apiPost(`/api/cmp/factors/${f.id}/items`, values);
                                    setOpenForm(null);
                                    await reload();
                                  } finally {
                                    setFormBusy(false);
                                  }
                                }}
                              />
                            )}

                            {f.items.length === 0 && <p className="ml-3 text-xs text-gray-400">No items yet.</p>}

                            {f.items.length > 0 && (
                              <div className="ml-3 flex items-center justify-end">
                                <WeightPill group={groupFor("item", f.id)} />
                              </div>
                            )}

                            <ul className="ml-3 divide-y divide-gray-50">
                              {f.items.map((it) => (
                                <li key={it.id} className="flex items-center justify-between py-1.5 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-mono text-gray-400">{it.itemCode}</span>
                                    <span className="text-gray-700">{it.name}</span>
                                    {it.criticalGate && (
                                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">Critical Gate</span>
                                    )}
                                    {it.evidenceRequired && (
                                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">Evidence Req.</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span className="rounded bg-gray-100 px-2 py-0.5">{it.scoringMethod}</span>
                                    <span>{(it.weight * 100).toFixed(1)}%</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
      </>
    );
  }
}
