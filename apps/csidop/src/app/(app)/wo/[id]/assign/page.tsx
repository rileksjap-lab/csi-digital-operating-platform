"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";

// ─── Types ──────────────────────────────────────────────────────────────────

interface WoContext {
  id: string;
  csiWoNo: string;
  title: string;
  status: string;
  priorityInterdepart: string;
  requestType: { typeName: string; domain: string };
  tier: { tierName: string };
  dueDate: string | null;
  assignedTo: { id: string; name: string } | null;
}

type Band = "Free" | "Safe" | "Warning" | "Overloaded";

interface StaffUtilization {
  staffId: string;
  name: string;
  roleCode: string;
  subTeam: string | null;
  deptCode: string;
  assignedHoursThisPeriod: number;
  workedHoursThisPeriod: number;
  remainingCapacityHours: number;
  utilizationPct: number;
  band: Band;
  openWoCount: number;
}

interface UtilizationResponse {
  staff: StaffUtilization[];
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const BAND_COLORS: Record<Band, { text: string; bg: string; bar: string }> = {
  Free:       { text: "text-green-700",  bg: "bg-green-100",  bar: "bg-green-500" },
  Safe:       { text: "text-blue-700",   bg: "bg-blue-100",   bar: "bg-blue-500" },
  Warning:    { text: "text-yellow-700", bg: "bg-yellow-100", bar: "bg-yellow-500" },
  Overloaded: { text: "text-red-700",    bg: "bg-red-100",    bar: "bg-red-500" },
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-green-100 text-green-700",
};

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700",
  InProgress: "bg-yellow-100 text-yellow-700",
  PendingApproval: "bg-purple-100 text-purple-700",
  Closed: "bg-gray-100 text-gray-700",
  OnHold: "bg-orange-100 text-orange-700",
};

// ─── Main ───────────────────────────────────────────────────────────────────

export default function AssignmentWorkflowPage() {
  const router = useRouter();
  const params = useParams();
  const woId = params.id as string;

  const [selectedStaff, setSelectedStaff] = useState<StaffUtilization | null>(null);
  const [assignedHours, setAssignedHours] = useState("24");
  const [reassignReason, setReassignReason] = useState("");
  const [podFilter, setPodFilter] = useState<string>("All");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: wo, error: woError } = useSWR<WoContext>(
    `/api/wo/${woId}`,
    apiFetcher
  );

  const { data: utilData } = useSWR<UtilizationResponse>(
    "/api/capacity",
    apiFetcher
  );

  if (woError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load work order
      </div>
    );
  }

  if (!wo) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  const isReassign = !!wo.assignedTo;
  const staff = utilData?.staff ?? [];

  const pods = ["All", ...Array.from(new Set(staff.map((s) => s.subTeam).filter((v): v is string => !!v)))];
  const filtered = podFilter === "All"
    ? staff
    : staff.filter((s) => s.subTeam === podFilter);

  async function handleConfirm() {
    if (!selectedStaff) return;
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      staffId: selectedStaff.staffId,
      assignedHours: Number(assignedHours),
    };
    if (isReassign && reassignReason.trim()) {
      body.reassignReason = reassignReason.trim();
    }

    try {
      await apiPost(`/api/wo/${woId}/assign`, body);
      mutate(`/api/wo/${woId}`);
      router.push(`/wo/${woId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">
          {isReassign ? "Reassign" : "Assign"} Work Order
        </h1>
        <button
          onClick={() => router.push(`/wo/${woId}`)}
          className="btn-secondary text-sm"
        >
          &larr; Back to WO
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left column: WO context + hours ── */}
        <div className="space-y-4">
          {/* WO context card */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <p className="text-xs font-mono text-gray-400 mb-1">{wo.csiWoNo}</p>
            <h3 className="font-semibold text-gray-900 mb-3">{wo.title}</h3>
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Status</p>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[wo.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {wo.status}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400">Priority</p>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[wo.priorityInterdepart] ?? "bg-gray-100 text-gray-700"}`}>
                  {wo.priorityInterdepart}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-400">Type</p>
                <p className="font-medium text-gray-900">{wo.requestType.typeName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Tier</p>
                <p className="font-medium text-gray-900">{wo.tier.tierName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Due</p>
                <p className="font-medium text-gray-900">
                  {wo.dueDate
                    ? new Date(wo.dueDate).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
                    : "—"}
                </p>
              </div>
            </div>
            {isReassign && wo.assignedTo && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">Currently assigned to</p>
                <p className="text-sm font-medium text-gray-700">{wo.assignedTo.name}</p>
              </div>
            )}
          </div>

          {/* Hours input */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Assigned Hours
            </label>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={assignedHours}
              onChange={(e) => setAssignedHours(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-4 py-3 text-lg font-bold text-gray-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 focus:outline-none"
              placeholder="Hours"
            />
            <p className="text-xs text-gray-400 mt-2">Must be greater than 0</p>

            {isReassign && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for reassignment <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="input-field"
                  placeholder="Why is this being reassigned?"
                />
              </div>
            )}

            {error && (
              <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {selectedStaff && (
              <>
                <div className="mt-4 p-3 rounded-lg bg-green-50 border border-green-100">
                  <p className="text-xs font-semibold text-green-800">
                    Selected: {selectedStaff.name}
                  </p>
                  <p className="text-xs text-green-600">
                    {selectedStaff.roleCode} · {selectedStaff.utilizationPct}% utilization · {selectedStaff.openWoCount} open WOs
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    Assignment will be logged to the audit trail
                  </p>
                </div>
                <button
                  onClick={handleConfirm}
                  disabled={submitting || Number(assignedHours) <= 0 || (isReassign && !reassignReason.trim())}
                  className="mt-3 w-full btn-primary py-3"
                >
                  {submitting ? "Assigning..." : "Confirm Assignment →"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Right column: Staff picker ── */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">Select Assignee</h3>
            <div className="flex gap-1">
              {pods.map((p) => (
                <button
                  key={p}
                  onClick={() => setPodFilter(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    podFilter === p
                      ? "bg-primary-600 text-white"
                      : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {p === "All" ? "All Pods" : `Pod ${p}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No staff found</p>
            ) : (
              filtered.map((s) => {
                const isSelected = selectedStaff?.staffId === s.staffId;
                const colors = BAND_COLORS[s.band];
                return (
                  <button
                    key={s.staffId}
                    onClick={() => setSelectedStaff(s)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-gray-50 ${
                      isSelected
                        ? "border-primary-300 bg-primary-50"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                      {s.name
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400">
                        {s.roleCode} · {s.subTeam ? `Pod ${s.subTeam}` : s.deptCode} · {s.openWoCount} open WOs
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-bold ${colors.bg} ${colors.text}`}
                      >
                        {s.band}
                      </span>
                      <div className="w-24 h-2 bg-gray-100 rounded-full mt-1">
                        <div
                          className={`h-2 rounded-full ${colors.bar}`}
                          style={{ width: `${Math.min(s.utilizationPct, 100)}%` }}
                        />
                      </div>
                      <p className={`text-xs font-bold mt-0.5 text-right ${colors.text}`}>
                        {s.utilizationPct}%
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Band legend */}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              {[
                { color: "bg-green-500", label: "Free < 50%" },
                { color: "bg-blue-500", label: "Safe 50–74%" },
                { color: "bg-yellow-500", label: "Warning 75–89%" },
                { color: "bg-red-500", label: "Overloaded ≥ 90%" },
              ].map((b) => (
                <span key={b.label} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${b.color}`} />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
