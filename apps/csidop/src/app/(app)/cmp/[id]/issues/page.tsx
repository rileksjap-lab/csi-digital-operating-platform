"use client";

import { useState, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetcher, apiPost, apiPatch } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";

// UI-level hint mirroring migration 038's seed (close_issues/
// record_decisions -- see docs/cmp-transformation/10_solution_design.md
// section 2). The API is the real enforcement point; this just avoids
// showing controls that would 403 anyway.
const CLOSE_ROLES = ["HOD", "SolutionManager"];

interface Issue {
  id: string;
  logCode: string;
  type: "Issue" | "Decision" | "Blocker";
  workstreamLabel: string | null;
  description: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  ownerRoleTitle: string;
  openedDate: string;
  dueDate: string | null;
  status: string;
  impact: string | null;
  supportRequired: string | null;
  decisionRequired: string | null;
  recoveryAction: string | null;
  closeDate: string | null;
}

const TYPES = ["Issue", "Decision", "Blocker"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const STATUSES = ["Open", "In Progress", "Closed"];

const SEVERITY_STYLES: Record<string, string> = {
  Low: "bg-gray-100 text-gray-600",
  Medium: "bg-blue-100 text-blue-700",
  High: "bg-amber-100 text-amber-700",
  Critical: "bg-red-100 text-red-700",
};

const TYPE_STYLES: Record<string, string> = {
  Issue: "bg-orange-100 text-orange-700",
  Decision: "bg-purple-100 text-purple-700",
  Blocker: "bg-red-100 text-red-700",
};

const STATUS_STYLES: Record<string, string> = {
  Open: "bg-gray-100 text-gray-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Closed: "bg-green-100 text-green-700",
};

interface FlatItem {
  id: string;
  itemCode: string;
  name: string;
}

function AddIssueForm({
  items,
  onSubmit,
  onCancel,
  submitting,
}: {
  items: FlatItem[];
  onSubmit: (v: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [type, setType] = useState("Issue");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("Medium");
  const [ownerRoleTitle, setOwnerRoleTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [relatedItemId, setRelatedItemId] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit({
            type, description, severity, ownerRoleTitle,
            dueDate: dueDate || undefined,
            relatedItemId: relatedItemId || undefined,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save");
        }
      }}
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-500">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500">Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500">Description</label>
          <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500">Owner Role</label>
          <input required value={ownerRoleTitle} onChange={(e) => setOwnerRoleTitle(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500">Due Date</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500">
            Related Tracking Item {type === "Decision" && <span className="text-gray-400">(a Decision linked here forces Red RAG once overdue)</span>}
          </label>
          <select value={relatedItemId} onChange={(e) => setRelatedItemId(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">None</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.itemCode} — {it.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={submitting} className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
          {submitting ? "Saving..." : "Log Entry"}
        </button>
      </div>
    </form>
  );
}

function IssueCard({ issue, canClose, onUpdate }: { issue: Issue; canClose: boolean; onUpdate: (patch: Record<string, unknown>) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryAction, setRecoveryAction] = useState(issue.recoveryAction ?? "");

  async function save(patch: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      await onUpdate(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const overdue = issue.status !== "Closed" && issue.dueDate && new Date(issue.dueDate) < new Date();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-gray-400">{issue.logCode}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_STYLES[issue.type]}`}>{issue.type}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLES[issue.severity]}`}>{issue.severity}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[issue.status] ?? "bg-gray-100 text-gray-700"}`}>{issue.status}</span>
            {overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Overdue</span>}
          </div>
          <p className="mt-1 text-sm text-gray-800">{issue.description}</p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            Owner: {issue.ownerRoleTitle} · Opened {new Date(issue.openedDate).toLocaleDateString()}
            {issue.dueDate && ` · Due ${new Date(issue.dueDate).toLocaleDateString()}`}
          </p>
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="shrink-0 text-xs font-medium text-primary-600 hover:underline">
          {expanded ? "Hide" : "Manage"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          <div className="flex flex-wrap items-end gap-3">
            {canClose && (
              <div>
                <label className="block text-[11px] font-medium text-gray-500">Status</label>
                <select
                  defaultValue={issue.status}
                  onChange={(e) => save({ status: e.target.value })}
                  disabled={saving}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <div className="min-w-[240px] flex-1">
              <label className="block text-[11px] font-medium text-gray-500">Recovery Action</label>
              <div className="flex gap-1">
                <input
                  value={recoveryAction}
                  onChange={(e) => setRecoveryAction(e.target.value)}
                  disabled={saving || !canClose}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
                {canClose && (
                  <button
                    onClick={() => save({ recoveryAction })}
                    disabled={saving}
                    className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>
          </div>
          {issue.impact && <p className="text-xs text-gray-500"><span className="font-medium">Impact:</span> {issue.impact}</p>}
          {issue.decisionRequired && <p className="text-xs text-gray-500"><span className="font-medium">Decision Required:</span> {issue.decisionRequired}</p>}
          {issue.closeDate && <p className="text-xs text-gray-400">Closed {new Date(issue.closeDate).toLocaleDateString()}</p>}
        </div>
      )}
    </div>
  );
}

export default function CmpIssuesPage() {
  const params = useParams();
  const planId = params.id as string;
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [items, setItems] = useState<FlatItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const reload = useCallback(async () => {
    try {
      const data = await apiFetcher<Issue[]>(`/api/cmp/plans/${planId}/issues`);
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load issues");
    }
  }, [planId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Flat item list, for the "Related Tracking Item" picker on the add form
  // -- same fan-out pattern as the Progress Update screen's loadFlatItems.
  useEffect(() => {
    (async () => {
      const workstreams = await apiFetcher<{ id: string }[]>(`/api/cmp/plans/${planId}/workstreams`);
      const flat: FlatItem[] = [];
      for (const ws of workstreams) {
        const initiatives = await apiFetcher<{ id: string }[]>(`/api/cmp/workstreams/${ws.id}/initiatives`);
        for (const init of initiatives) {
          const factors = await apiFetcher<{ id: string }[]>(`/api/cmp/initiatives/${init.id}/factors`);
          for (const f of factors) {
            const factorItems = await apiFetcher<FlatItem[]>(`/api/cmp/factors/${f.id}/items`);
            flat.push(...factorItems);
          }
        }
      }
      setItems(flat);
    })().catch(() => {
      /* non-critical -- the picker just stays empty ("None" only) if this fails */
    });
  }, [planId]);

  const user = useAuthStore((s) => s.user);
  const canClose = user ? CLOSE_ROLES.includes(user.role) : false;

  const filtered = issues?.filter((i) => statusFilter === "All" || i.status === statusFilter) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Issues, Decisions &amp; Blockers</h1>
          <p className="mt-0.5 text-sm text-gray-500">Management support log — explains S-Curve variance and tracks recovery actions.</p>
        </div>
        <Link href={`/cmp/${planId}`} className="text-sm font-medium text-primary-600 hover:underline">← Back to Plan Setup</Link>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {["All", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${statusFilter === s ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd((v) => !v)} className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700">
          + Log Entry
        </button>
      </div>

      {showAdd && (
        <AddIssueForm
          items={items}
          submitting={formBusy}
          onCancel={() => setShowAdd(false)}
          onSubmit={async (values) => {
            setFormBusy(true);
            try {
              await apiPost(`/api/cmp/plans/${planId}/issues`, values);
              setShowAdd(false);
              await reload();
            } finally {
              setFormBusy(false);
            }
          }}
        />
      )}

      {!issues && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {issues && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">
          No entries{statusFilter !== "All" ? ` with status "${statusFilter}"` : ""} yet.
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            canClose={canClose}
            onUpdate={async (patch) => {
              await apiPatch(`/api/cmp/issues/${issue.id}`, patch);
              await reload();
            }}
          />
        ))}
      </div>
    </div>
  );
}
