"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiPatch, apiFetcher } from "@/lib/api/fetcher";

interface WoPatchDialogProps {
  woId: string;
  wo: {
    title: string;
    priorityInterdepart: string;
    priorityInternal: string | null;
    dueDate: string | null;
    sourceOfWO: string | null;
    requesterName: string | null;
    remark: string | null;
    slaWorkingDays: number | null;
    status: string;
    tenderOrProjectCode: string | null;
    createdAt: string;
    requestType: { id: string };
    tier: { id: string };
  };
  onClose: () => void;
  onSuccess: () => void;
}

const PRIORITIES = ["Low", "Normal", "High", "Urgent", "Critical"] as const;
const PRIORITIES_INTERNAL = ["Low", "Normal", "High", "Urgent", "Critical", "N/A"] as const;
const STATUSES = ["Open", "Acknowledged", "InProgress", "PendingApproval", "Approved", "Closed", "Returned", "Cancelled"] as const;

interface Lookups {
  requestTypes: { id: string; typeName: string; domain: string }[];
  tiers: { id: string; tierCode: number; tierName: string }[];
}

export default function WoPatchDialog({ woId, wo, onClose, onSuccess }: WoPatchDialogProps) {
  const [title, setTitle] = useState(wo.title);
  const [priority, setPriority] = useState(wo.priorityInterdepart);
  const [priorityInternal, setPriorityInternal] = useState(wo.priorityInternal ?? "");
  const [dueDate, setDueDate] = useState(wo.dueDate?.slice(0, 10) ?? "");
  const [source, setSource] = useState(wo.sourceOfWO ?? "");
  const [requester, setRequester] = useState(wo.requesterName ?? "");
  const [remark, setRemark] = useState(wo.remark ?? "");
  const [sla, setSla] = useState(wo.slaWorkingDays != null ? String(wo.slaWorkingDays) : "");
  const [status, setStatus] = useState(wo.status);
  const [tenderCode, setTenderCode] = useState(wo.tenderOrProjectCode ?? "");
  const [createdAt, setCreatedAt] = useState(wo.createdAt?.slice(0, 10) ?? "");
  const [requestTypeId, setRequestTypeId] = useState(wo.requestType.id);
  const [tierId, setTierId] = useState(wo.tier.id);
  const [amendReason, setAmendReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: lookups } = useSWR<Lookups>("/api/lookups", apiFetcher);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {};

    if (title !== wo.title) body.title = title;
    if (priority !== wo.priorityInterdepart) body.priority = priority;
    if (priorityInternal !== (wo.priorityInternal ?? "")) body.priorityInternal = priorityInternal || null;
    if (dueDate !== (wo.dueDate?.slice(0, 10) ?? "")) body.dueDate = dueDate || null;
    if (source !== (wo.sourceOfWO ?? "")) body.sourceOfWO = source || null;
    if (requester !== (wo.requesterName ?? "")) body.requesterName = requester || null;
    if (remark !== (wo.remark ?? "")) body.remark = remark || null;
    if (sla !== (wo.slaWorkingDays != null ? String(wo.slaWorkingDays) : "")) {
      body.slaWorkingDays = sla ? parseInt(sla, 10) : null;
    }
    if (status !== wo.status) body.status = status;
    if (tenderCode !== (wo.tenderOrProjectCode ?? "")) body.tenderOrProjectCode = tenderCode || null;
    if (createdAt !== (wo.createdAt?.slice(0, 10) ?? "")) {
      body.createdAt = new Date(createdAt).toISOString();
    }
    if (requestTypeId !== wo.requestType.id) body.requestTypeId = requestTypeId;
    if (tierId !== wo.tier.id) body.tierId = tierId;
    if (amendReason.trim()) body.amendReason = amendReason.trim();

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    try {
      await apiPatch(`/api/wo/${woId}`, body);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">Edit Work Order</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <div className="text-sm text-red-600">{error}</div>}

        {/* Row 1: Title */}
        <div>
          <label className="block text-xs font-medium text-gray-600">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
            className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        {/* Row 2: Status, Priority, Priority Internal */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Priority (Interdepart)</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Priority (Internal)</label>
            <select
              value={priorityInternal}
              onChange={(e) => setPriorityInternal(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">— None —</option>
              {PRIORITIES_INTERNAL.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Row 3: Request Type, Tier, Source */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">Request Type</label>
            <select
              value={requestTypeId}
              onChange={(e) => setRequestTypeId(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {(lookups?.requestTypes ?? []).map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.typeName} ({rt.domain})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Tier</label>
            <select
              value={tierId}
              onChange={(e) => setTierId(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {(lookups?.tiers ?? []).map((t) => (
                <option key={t.id} value={t.id}>Tier {t.tierCode} — {t.tierName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={100}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
              placeholder="e.g. CMT, CSI, CSA"
            />
          </div>
        </div>

        {/* Row 4: Due Date, SLA, Created Date */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">SLA (Working Days)</label>
            <input
              type="number"
              value={sla}
              onChange={(e) => setSla(e.target.value)}
              min={0}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
              placeholder="e.g. 10"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Created Date</label>
            <input
              type="date"
              value={createdAt}
              onChange={(e) => setCreatedAt(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* Row 5: Requester, Tender/Project Code */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600">PIC / Requester</label>
            <input
              type="text"
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
              maxLength={200}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Tender / Project Code</label>
            <input
              type="text"
              value={tenderCode}
              onChange={(e) => setTenderCode(e.target.value)}
              maxLength={100}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        {/* Row 6: Remark */}
        <div>
          <label className="block text-xs font-medium text-gray-600">Remark</label>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            maxLength={2000}
            rows={3}
            className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        {/* Row 7: Amend reason */}
        <div>
          <label className="block text-xs font-medium text-gray-600">Reason for changes (optional)</label>
          <input
            type="text"
            value={amendReason}
            onChange={(e) => setAmendReason(e.target.value)}
            maxLength={500}
            className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            placeholder="Brief reason for amendments"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
