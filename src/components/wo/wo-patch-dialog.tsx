"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/api/fetcher";

interface WoPatchDialogProps {
  woId: string;
  currentPriority: string;
  currentDueDate: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

const PRIORITIES = ["Low", "Normal", "High", "Urgent", "Critical"] as const;

export default function WoPatchDialog({
  woId,
  currentPriority,
  currentDueDate,
  onClose,
  onSuccess,
}: WoPatchDialogProps) {
  const [priority, setPriority] = useState(currentPriority);
  const [dueDate, setDueDate] = useState(currentDueDate?.slice(0, 10) ?? "");
  const [amendReason, setAmendReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priorityChanged = priority !== currentPriority;
  const dueDateChanged = dueDate !== (currentDueDate?.slice(0, 10) ?? "");
  const needsReason = dueDateChanged;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {};
    if (priorityChanged) body.priority = priority;
    if (dueDateChanged) body.dueDate = dueDate || undefined;
    if (needsReason) body.amendReason = amendReason.trim();

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
      <h3 className="mb-3 text-sm font-semibold text-gray-800">
        Edit Work Order
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="text-sm text-red-600">{error}</div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Due Date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          {needsReason && (
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                placeholder="Reason for change"
              />
            </div>
          )}
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
