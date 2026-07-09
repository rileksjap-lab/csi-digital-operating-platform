"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { apiFetcher, apiPost, apiPatch } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";
import WoStatusBadge from "@/components/wo/wo-status-badge";
import WoPriorityBadge from "@/components/wo/wo-priority-badge";
import WoPatchDialog from "@/components/wo/wo-patch-dialog";
import WoEffortForm from "@/components/wo/wo-effort-form";
import WoEvidencePanel from "@/components/wo/wo-evidence-panel";
import WoSlaBadge from "@/components/wo/wo-sla-badge";
import WoTaskChecklist from "@/components/wo/wo-task-checklist";
import WoDiscussion from "@/components/wo/wo-discussion";

interface WoTaskItem {
  id: string;
  taskNo: number;
  description: string;
  assignedToId: string | null;
  assignedToName: string | null;
  progress: number;
  scope: string;
  status: string;
  dateCreated: string;
  dateCompleted: string | null;
}

interface WoDetail {
  id: string;
  csiWoNo: string;
  extWoNo: string | null;
  sourceOfWO: string | null;
  requesterName: string | null;
  tenderOrProjectCode: string | null;
  tender: { id: string; tenderNo: string; tenderName: string; status: string } | null;
  requestType: { id: string; typeCode: number; typeName: string; domain: string };
  tier: { id: string; tierCode: number; tierName: string };
  priorityInterdepart: string;
  priorityInternal: string | null;
  title: string;
  indicativeValue: number | null;
  complexityValue: number | null;
  taskScore: number | null;
  slaWorkingDays: number | null;
  dueDate: string | null;
  slaDaysRemaining: number | null;
  slaStatus: string | null;
  status: string;
  remark: string | null;
  monitoringStaff: { id: string; name: string } | null;
  progressPercent: number;
  createdAt: string;
  updatedAt: string | null;
  createdBy: { id: string; name: string; roleCode: string };
  assignedTo: { id: string; name: string; roleCode: string; subTeam: string | null } | null;
  tasks: WoTaskItem[];
  assignmentHistory: {
    assignedTo: string;
    assignedBy: string;
    assignedHours: number;
    assignedDate: string;
    isCurrent: boolean;
    reassignReason: string | null;
  }[];
  effortLog: {
    id: string;
    staffName: string;
    logDate: string;
    hours: number;
    notes: string | null;
    loggedByName: string | null;
  }[];
  evidenceItems: {
    id: string;
    fileRef: string;
    evidenceType: string;
    caption: string | null;
    uploadedByName: string;
    uploadedDate: string;
  }[];
  approvalTrail: {
    tierCode: number;
    tierName: string;
    approvedByName: string;
    decision: string;
    reason: string | null;
    decisionDate: string;
  }[];
  activityLog: {
    action: string;
    fieldName: string | null;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    performedAt: string;
    performedByName: string;
  }[];
}

type Role = "HOD" | "SolutionManager" | "TeamLead" | "BIMTeamLead" | "TeamMember" | "BIMModeler";
const ASSIGN_ROLES: Role[] = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];
const APPROVE_ROLES: Role[] = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

export default function WoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: wo, error, isLoading, mutate } = useSWR<WoDetail>(
    `/api/wo/${id}`,
    apiFetcher
  );
  const user = useAuthStore((s) => s.user);

  const [showPatch, setShowPatch] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !wo) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error?.message ?? "Work order not found"}
      </div>
    );
  }

  const canAssign = user && ASSIGN_ROLES.includes(user.role as Role);
  const canPatch = user && ASSIGN_ROLES.includes(user.role as Role);
  const canComplete =
    wo.status === "Open" || wo.status === "InProgress";
  const canApprove =
    user &&
    APPROVE_ROLES.includes(user.role as Role) &&
    wo.status === "PendingApproval";

  async function handleComplete() {
    setActionError(null);
    setActionLoading(true);
    try {
      await apiPost(`/api/wo/${id}/complete`, {});
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApprove(decision: "Approved" | "Returned", reason?: string) {
    setActionError(null);
    setActionLoading(true);
    try {
      await apiPost(`/api/wo/${id}/approve`, { decision, reason });
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel(reason: string) {
    setActionError(null);
    setActionLoading(true);
    try {
      await apiPost(`/api/wo/${id}/cancel`, { reason });
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/wo"
          className="text-xs text-gray-500 hover:text-primary-600"
        >
          ← Back to Work Orders
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-gray-800">
            {wo.csiWoNo}
          </h1>
          <WoStatusBadge status={wo.status} />
          <WoPriorityBadge priority={wo.priorityInterdepart} />
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            Tier {wo.tier.tierCode}
          </span>
          <WoSlaBadge slaStatus={wo.slaStatus} slaDaysRemaining={wo.slaDaysRemaining} />
        </div>
        <p className="mt-1 text-sm text-gray-600">{wo.title}</p>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {canAssign && (
          <Link
            href={`/wo/${wo.id}/assign`}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {wo.assignedTo ? "Reassign" : "Assign"}
          </Link>
        )}
        {canPatch && (
          <button
            onClick={() => setShowPatch(true)}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Edit Details
          </button>
        )}
        {canComplete && wo.status !== "Closed" && wo.status !== "PendingApproval" && (
          <button
            onClick={handleComplete}
            disabled={actionLoading}
            className="rounded bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            Mark Complete
          </button>
        )}
        {canApprove && (
          <>
            <ApproveButton onApprove={(reason) => handleApprove("Approved", reason)} disabled={actionLoading} />
            <ReturnButton onReturn={(reason) => handleApprove("Returned", reason)} disabled={actionLoading} />
          </>
        )}
        {canAssign && wo.status !== "Closed" && wo.status !== "Cancelled" && (
          <CancelButton onCancel={handleCancel} disabled={actionLoading} />
        )}
      </div>

      {actionError && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Patch dialog */}
      {showPatch && (
        <WoPatchDialog
          woId={id}
          wo={wo}
          onClose={() => setShowPatch(false)}
          onSuccess={() => {
            setShowPatch(false);
            mutate();
          }}
        />
      )}

      {/* Progress scoreboard */}
      <ScoreBoard wo={wo} />

      {/* Overview grid */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-4">
        <Field label="Source" value={wo.sourceOfWO ?? "—"} />
        <Field label="PIC / Requester" value={wo.requesterName ?? "—"} />
        <Field label="Domain" value={wo.requestType.domain} />
        <Field label="Request Type" value={wo.requestType.typeName} />
        <Field label="External WO" value={wo.extWoNo ?? "—"} />
        <Field
          label="Tender"
          value={wo.tender ? wo.tender.tenderNo : "—"}
        />
        <Field label="Tender No / Project Code" value={wo.tenderOrProjectCode ?? "—"} />
        <Field label="Created By" value={wo.createdBy.name} />
        <Field
          label="Assigned To"
          value={wo.assignedTo?.name ?? "Unassigned"}
        />
        <Field
          label="Due Date"
          value={
            wo.dueDate
              ? new Date(wo.dueDate).toLocaleDateString("en-MY")
              : "—"
          }
        />
        <Field
          label="Created"
          value={new Date(wo.createdAt).toLocaleDateString("en-MY")}
        />
        <Field
          label="Indicative Value"
          value={
            wo.indicativeValue != null
              ? `RM ${wo.indicativeValue.toLocaleString()}`
              : "—"
          }
        />
        <Field
          label="Task Score"
          value={wo.taskScore != null ? String(wo.taskScore) : "—"}
        />
        <div className="col-span-2 md:col-span-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Remark</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap">{wo.remark || "—"}</p>
        </div>
      </div>

      {/* Task Checklist */}
      <Section title="Task Checklist" count={wo.tasks.length}>
        <WoTaskChecklist
          woId={id}
          tasks={wo.tasks}
          canEdit={
            wo.status !== "Closed" && wo.status !== "Cancelled" &&
            !!(user && (ASSIGN_ROLES.includes(user.role as Role) || user.staffId === wo.assignedTo?.id))
          }
          canAddTask={
            wo.status !== "Closed" && wo.status !== "Cancelled" &&
            !!(user && (ASSIGN_ROLES.includes(user.role as Role) || user.staffId === wo.assignedTo?.id))
          }
          onSuccess={() => mutate()}
        />
      </Section>

      {/* Assignment History */}
      <Section title="Assignment History" count={wo.assignmentHistory.length}>
        {wo.assignmentHistory.length === 0 ? (
          <EmptyState text="No assignments yet" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Assigned To</th>
                <th className="px-4 py-2 text-left">By</th>
                <th className="px-4 py-2 text-right">Hours</th>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Current</th>
                <th className="px-4 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {wo.assignmentHistory.map((a, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">{a.assignedTo}</td>
                  <td className="px-4 py-2 text-gray-500">{a.assignedBy}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {a.assignedHours}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(a.assignedDate).toLocaleDateString("en-MY")}
                  </td>
                  <td className="px-4 py-2">
                    {a.isCurrent ? (
                      <span className="text-green-600 font-medium">Yes</span>
                    ) : (
                      <span className="text-gray-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {a.reassignReason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Effort Log */}
      <Section title="Effort Log" count={wo.effortLog.length}>
        <WoEffortForm
          woId={id}
          isAssignee={user?.staffId === wo.assignedTo?.id}
          isLead={!!(user && ASSIGN_ROLES.includes(user.role as Role))}
          woClosed={wo.status === "Closed"}
          userRole={user?.role ?? ""}
          effortLog={wo.effortLog}
          onSuccess={() => mutate()}
        />
      </Section>

      {/* Evidence */}
      <Section title="Evidence" count={wo.evidenceItems.length}>
        <WoEvidencePanel
          woId={id}
          canUpload={!!user}
          woClosed={false}
          evidenceItems={wo.evidenceItems}
          onSuccess={() => mutate()}
        />
      </Section>

      {/* Approval Trail */}
      <Section title="Approval Trail" count={wo.approvalTrail.length}>
        {wo.approvalTrail.length === 0 ? (
          <EmptyState text="No approval decisions" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
                <th className="px-4 py-2 text-left">Tier</th>
                <th className="px-4 py-2 text-left">Approver</th>
                <th className="px-4 py-2 text-left">Decision</th>
                <th className="px-4 py-2 text-left">Reason</th>
                <th className="px-4 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {wo.approvalTrail.map((ap, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">
                    {ap.tierName} (T{ap.tierCode})
                  </td>
                  <td className="px-4 py-2">{ap.approvedByName}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ap.decision === "Approved"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {ap.decision}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {ap.reason ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(ap.decisionDate).toLocaleDateString("en-MY")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Discussion */}
      <Section title="Discussion">
        <WoDiscussion woId={wo.id} currentStaffId={user?.staffId ?? ""} />
      </Section>

      {/* Activity Log */}
      <Section title="Activity Log" count={wo.activityLog.length}>
        {wo.activityLog.length === 0 ? (
          <EmptyState text="No activity recorded" />
        ) : (
          <div className="divide-y divide-gray-100">
            {wo.activityLog.map((al, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                <div className="mt-0.5 h-2 w-2 rounded-full bg-primary-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-800">
                    <span className="font-medium">{al.performedByName}</span>
                    {" "}
                    {al.action === "Insert" && !al.fieldName && "created this work order"}
                    {al.action === "Update" && al.fieldName && (
                      <>
                        changed <span className="font-medium">{al.fieldName}</span>
                        {al.oldValue && (
                          <> from <span className="text-gray-500 line-through">{al.oldValue.length > 60 ? al.oldValue.slice(0, 60) + "..." : al.oldValue}</span></>
                        )}
                        {al.newValue && (
                          <> to <span className="text-primary-700">{al.newValue.length > 60 ? al.newValue.slice(0, 60) + "..." : al.newValue}</span></>
                        )}
                      </>
                    )}
                    {al.action === "Insert" && al.fieldName && (
                      <>
                        added <span className="font-medium">{al.fieldName}</span>
                        {al.newValue && <> — <span className="text-primary-700">{al.newValue.length > 60 ? al.newValue.slice(0, 60) + "..." : al.newValue}</span></>}
                      </>
                    )}
                  </div>
                  {al.reason && (
                    <div className="text-xs text-gray-500 mt-0.5">Reason: {al.reason}</div>
                  )}
                </div>
                <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                  {new Date(al.performedAt).toLocaleString("en-MY", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function ApproveButton({
  onApprove,
  disabled,
}: {
  onApprove: (reason?: string) => void;
  disabled: boolean;
}) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  if (!showReason) {
    return (
      <button
        onClick={() => setShowReason(true)}
        disabled={disabled}
        className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        Approve
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <button
        onClick={() => {
          onApprove(reason.trim() || undefined);
          setShowReason(false);
          setReason("");
        }}
        disabled={disabled}
        className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        Confirm
      </button>
      <button
        onClick={() => { setShowReason(false); setReason(""); }}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        Cancel
      </button>
    </div>
  );
}

function ReturnButton({
  onReturn,
  disabled,
}: {
  onReturn: (reason: string) => void;
  disabled: boolean;
}) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  if (!showReason) {
    return (
      <button
        onClick={() => setShowReason(true)}
        disabled={disabled}
        className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        Return
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Return reason (required)"
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <button
        onClick={() => {
          if (reason.trim()) {
            onReturn(reason.trim());
            setShowReason(false);
            setReason("");
          }
        }}
        disabled={disabled || !reason.trim()}
        className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        Confirm Return
      </button>
      <button
        onClick={() => { setShowReason(false); setReason(""); }}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        Cancel
      </button>
    </div>
  );
}

function CancelButton({
  onCancel,
  disabled,
}: {
  onCancel: (reason: string) => void;
  disabled: boolean;
}) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");

  if (!showReason) {
    return (
      <button
        onClick={() => setShowReason(true)}
        disabled={disabled}
        className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        Cancel WO
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Cancellation reason (required)"
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <button
        onClick={() => {
          if (reason.trim()) {
            onCancel(reason.trim());
            setShowReason(false);
            setReason("");
          }
        }}
        disabled={disabled || !reason.trim()}
        className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        Confirm Cancel
      </button>
      <button
        onClick={() => { setShowReason(false); setReason(""); }}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        Dismiss
      </button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h2 className="text-sm font-medium text-gray-700">
          {title}
          {count != null && <span className="ml-1 text-gray-400">({count})</span>}
        </h2>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm text-gray-400">{text}</div>
  );
}

function ScoreBoard({ wo }: { wo: WoDetail }) {
  const activeTasks = wo.tasks.filter((t) => t.status === "Active");
  const doneTasks = activeTasks.filter((t) => t.progress === 100).length;
  const totalEffort = wo.effortLog.reduce((sum, e) => sum + e.hours, 0);

  const deadlineDays = wo.dueDate
    ? Math.ceil((new Date(wo.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const deadlinePast = deadlineDays != null && deadlineDays < 0;
  const deadlineUrgent = deadlineDays != null && deadlineDays >= 0 && deadlineDays <= 3;

  const hasDueDate = wo.dueDate != null;

  return (
    <div className={`grid grid-cols-2 gap-4 ${hasDueDate ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
      {/* Progress ring */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 flex flex-col items-center justify-center">
        <div className="relative h-20 w-20">
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="40" cy="40" r="34" fill="none"
              stroke={wo.progressPercent === 100 ? "#22c55e" : "#3b82f6"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 34}`}
              strokeDashoffset={`${2 * Math.PI * 34 * (1 - wo.progressPercent / 100)}`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-gray-800">
            {wo.progressPercent}%
          </span>
        </div>
        <span className="mt-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Progress</span>
      </div>

      {/* Tasks done */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-800 tabular-nums">
          {doneTasks}
          <span className="text-lg text-gray-400">/{activeTasks.length}</span>
        </span>
        <span className="mt-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Tasks Done</span>
      </div>

      {/* Effort hours */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-800 tabular-nums">
          {totalEffort.toFixed(1)}
        </span>
        <span className="mt-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Effort Hours</span>
      </div>

      {/* Deadline — only when due date is set */}
      {hasDueDate && (
        <div className={`rounded-lg border p-5 flex flex-col items-center justify-center ${
          deadlinePast ? "border-red-300 bg-red-50" :
          deadlineUrgent ? "border-amber-300 bg-amber-50" :
          "border-gray-200 bg-white"
        }`}>
          <span className={`text-3xl font-bold tabular-nums ${
            deadlinePast ? "text-red-600" :
            deadlineUrgent ? "text-amber-600" : "text-gray-800"
          }`}>
            {deadlinePast ? `${Math.abs(deadlineDays!)}d` : `${deadlineDays}d`}
          </span>
          <span className={`mt-1 text-xs font-medium uppercase tracking-wide ${
            deadlinePast ? "text-red-500" :
            deadlineUrgent ? "text-amber-500" : "text-gray-500"
          }`}>
            {deadlinePast ? "Past Deadline" : "To Deadline"}
          </span>
          <span className="mt-0.5 text-[10px] text-gray-400">
            {new Date(wo.dueDate!).toLocaleDateString("en-MY")}
          </span>
        </div>
      )}

      {/* SLA */}
      <div className="rounded-lg border border-gray-200 bg-white p-5 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold tabular-nums ${
          wo.slaStatus === "Breached" ? "text-red-600" :
          wo.slaStatus === "Warning" ? "text-amber-600" : "text-green-600"
        }`}>
          {wo.slaDaysRemaining != null ? `${Math.abs(wo.slaDaysRemaining)}d` : "—"}
        </span>
        <span className="mt-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
          {wo.slaStatus === "Breached" ? "SLA Overdue" : wo.slaStatus === "Warning" ? "SLA At Risk" : "SLA Remaining"}
        </span>
      </div>
    </div>
  );
}
