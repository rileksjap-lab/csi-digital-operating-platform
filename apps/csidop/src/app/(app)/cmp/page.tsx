"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";

// Mirrors requireCmpCapability(session, "manage_hierarchy") -- see
// migration 039 (HOD given unrestricted access to every CMP capability,
// per user decision, superseding 038's stricter SM/HOD split) and
// docs/cmp-transformation/10_solution_design.md section 2. UI-level hint
// only; the API is the real enforcement point.
const CMP_MANAGE_ROLES = ["SolutionManager", "HOD"];

interface CmpPlan {
  id: string;
  planCode: string;
  name: string;
  baselineStatus: "Draft" | "Locked" | "Approved";
  createdAt: string;
}

function StatusBadge({ status }: { status: CmpPlan["baselineStatus"] }) {
  const styles: Record<string, string> = {
    Draft: "bg-gray-100 text-gray-700",
    Locked: "bg-amber-100 text-amber-700",
    Approved: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function CmpPlanListPage() {
  const user = useAuthStore((s) => s.user);
  const canCreate = user ? CMP_MANAGE_ROLES.includes(user.role) : false;

  const { data: plans, error, isLoading, mutate } = useSWR<CmpPlan[]>("/api/cmp/plans", apiFetcher);

  const [showCreate, setShowCreate] = useState(false);
  const [planCode, setPlanCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await apiPost("/api/cmp/plans", { planCode: planCode.trim(), name: name.trim() });
      setPlanCode("");
      setName("");
      setShowCreate(false);
      mutate();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create plan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Transformation Plan (CMP)</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            5-year corporate transformation readiness — New Co, subsidiaries, and strategic growth verticals.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Plan
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          {formError && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Plan Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={30}
                value={planCode}
                onChange={(e) => setPlanCode(e.target.value)}
                placeholder="CMP-2026-2031"
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="5-Year Corporate Transformation Plan"
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Plan"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      )}

      {plans && plans.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white py-12 text-center text-sm text-gray-500">
          No transformation plans yet.
        </div>
      )}

      {plans && plans.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Plan Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Baseline Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.map((plan) => (
                <tr key={plan.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-primary-700">
                    <Link href={`/cmp/${plan.id}`}>{plan.planCode}</Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <Link href={`/cmp/${plan.id}`} className="hover:underline">{plan.name}</Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={plan.baselineStatus} /></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(plan.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
