"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";

interface StaffItem {
  Id: string;
  Name: string;
  RoleCode: string;
  DeptCode: string;
}

interface WoAssignDialogProps {
  woId: string;
  isReassign: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function WoAssignDialog({
  woId,
  isReassign,
  onClose,
  onSuccess,
}: WoAssignDialogProps) {
  const { data: staff } = useSWR<StaffItem[]>("/api/staff", apiFetcher);
  const [staffId, setStaffId] = useState("");
  const [assignedHours, setAssignedHours] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      staffId,
      assignedHours: Number(assignedHours),
    };
    if (isReassign && reassignReason.trim()) {
      body.reassignReason = reassignReason.trim();
    }

    try {
      await apiPost(`/api/wo/${woId}/assign`, body);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">
        {isReassign ? "Reassign Work Order" : "Assign Work Order"}
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && (
          <div className="text-sm text-red-600">{error}</div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Staff Member <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Select staff...</option>
              {staff?.map((s) => (
                <option key={s.Id} value={s.Id}>
                  {s.Name} ({s.RoleCode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">
              Assigned Hours <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              required
              min={0.5}
              step={0.5}
              value={assignedHours}
              onChange={(e) => setAssignedHours(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
              placeholder="8"
            />
          </div>
          {isReassign && (
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                placeholder="Reason for reassignment"
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
            {submitting ? "Assigning..." : isReassign ? "Reassign" : "Assign"}
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
