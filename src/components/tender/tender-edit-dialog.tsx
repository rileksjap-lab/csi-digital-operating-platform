"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPatch } from "@/lib/api/fetcher";

interface TenderEditDialogProps {
  tenderId: string;
  current: {
    tenderName: string;
    client: string;
    tenderCategory: string | null;
    closingDate: string;
    estimatedValue: number;
    submittedValue: number | null;
    winValue: number | null;
    status: string;
    ownerId: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface StaffItem {
  id: string;
  name: string;
}

const STATUSES = [
  "Prospect",
  "Qualified",
  "InProgress",
  "Submitted",
  "Clarification",
  "Won",
  "Lost",
  "Cancelled",
] as const;

export default function TenderEditDialog({
  tenderId,
  current,
  onClose,
  onSuccess,
}: TenderEditDialogProps) {
  const [tenderName, setTenderName] = useState(current.tenderName);
  const [client, setClient] = useState(current.client);
  const [tenderCategory, setTenderCategory] = useState(current.tenderCategory ?? "");
  const [closingDate, setClosingDate] = useState(current.closingDate.slice(0, 10));
  const [estimatedValue, setEstimatedValue] = useState(String(current.estimatedValue));
  const [submittedValue, setSubmittedValue] = useState(
    current.submittedValue != null ? String(current.submittedValue) : ""
  );
  const [winValue, setWinValue] = useState(
    current.winValue != null ? String(current.winValue) : ""
  );
  const [status, setStatus] = useState(current.status);
  const [ownerId, setOwnerId] = useState(current.ownerId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: staff } = useSWR<StaffItem[]>("/api/staff", apiFetcher);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {};
    if (tenderName !== current.tenderName) body.tenderName = tenderName;
    if (client !== current.client) body.client = client;
    const newCat = tenderCategory.trim() || null;
    if (newCat !== current.tenderCategory) body.tenderCategory = newCat;
    if (closingDate !== current.closingDate.slice(0, 10)) body.closingDate = closingDate;
    const estVal = parseFloat(estimatedValue);
    if (!isNaN(estVal) && estVal !== current.estimatedValue) body.estimatedValue = estVal;
    const subVal = submittedValue.trim() ? parseFloat(submittedValue) : null;
    if (subVal !== current.submittedValue) body.submittedValue = subVal;
    const wVal = winValue.trim() ? parseFloat(winValue) : null;
    if (wVal !== current.winValue) body.winValue = wVal;
    if (status !== current.status) body.status = status;
    if (ownerId !== current.ownerId) body.tenderOwnerId = ownerId;

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    try {
      await apiPatch(`/api/tender/${tenderId}`, body);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-800">Edit Tender</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600">
              Tender Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={tenderName}
              onChange={(e) => setTenderName(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Client <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Category
            </label>
            <input
              type="text"
              value={tenderCategory}
              onChange={(e) => setTenderCategory(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Closing Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Estimated Value (RM) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Submitted Value (RM)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={submittedValue}
              onChange={(e) => setSubmittedValue(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Win Value (RM)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={winValue}
              onChange={(e) => setWinValue(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">
              Owner <span className="text-red-500">*</span>
            </label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {(staff ?? []).filter((s) => s.id).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

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
