"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost, apiPatch } from "@/lib/api/fetcher";

interface StaffOption {
  Id: string;
  Name: string;
  RoleCode: string;
  SubTeam: string | null;
}

interface EffortEntry {
  id: string;
  staffName: string;
  logDate: string;
  hours: number;
  notes: string | null;
}

interface WoEffortFormProps {
  woId: string;
  isAssignee: boolean;
  isLead: boolean;
  woClosed: boolean;
  effortLog: EffortEntry[];
  onSuccess: () => void;
}

export default function WoEffortForm({
  woId,
  isAssignee,
  isLead,
  woClosed,
  effortLog,
  onSuccess,
}: WoEffortFormProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [logDate, setLogDate] = useState(today);
  const [staffId, setStaffId] = useState("");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const canLog = isAssignee || isLead;
  const { data: staffList } = useSWR<StaffOption[]>(
    canLog ? "/api/staff" : null,
    apiFetcher
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost("/api/effort", {
        woId,
        logDate,
        hours: Number(hours),
        notes: notes.trim() || undefined,
        ...(staffId ? { staffId } : {}),
      });
      setHours("");
      setNotes("");
      setStaffId("");
      setLogDate(today);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log effort");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(entry: EffortEntry) {
    setEditingId(entry.id);
    setEditHours(String(entry.hours));
    setEditNotes(entry.notes ?? "");
  }

  async function handleEditSave() {
    if (!editingId) return;
    setEditSubmitting(true);
    try {
      await apiPatch(`/api/effort/${editingId}`, {
        hours: Number(editHours),
        notes: editNotes.trim() || undefined,
      });
      setEditingId(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setEditSubmitting(false);
    }
  }

  const canEditEntry = (_entry: EffortEntry) => {
    return canLog;
  };

  return (
    <div>
      {/* Log effort form — only for current assignee on non-closed WOs */}
      {canLog && (
        <div className="border-b border-gray-200 px-4 py-3">
          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600">Date</label>
              <input
                type="date"
                value={logDate}
                max={today}
                onChange={(e) => setLogDate(e.target.value)}
                className="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                On Behalf Of
              </label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
              >
                <option value="">— Myself —</option>
                {(staffList ?? []).map((s) => (
                  <option key={s.Id} value={s.Id}>
                    {s.Name} ({s.RoleCode}{s.SubTeam ? ` · ${s.SubTeam}` : ""})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600">
                Hours <span className="text-gray-400">(max 8)</span>
              </label>
              <input
                type="number"
                required
                min={0.25}
                max={8}
                step={0.25}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="mt-1 block w-20 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                placeholder="0"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs font-medium text-gray-600">Notes</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                placeholder="Optional notes"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !hours}
              className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? "Logging..." : "Log Effort"}
            </button>
          </form>
          {error && (
            <div className="mt-2 text-sm text-red-600">{error}</div>
          )}
        </div>
      )}

      {/* Effort log table */}
      {effortLog.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No effort logged
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Staff</th>
              <th className="px-4 py-2 text-right">Hours</th>
              <th className="px-4 py-2 text-left">Notes</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {effortLog.map((e) => (
              <tr key={e.id}>
                <td className="px-4 py-2 text-gray-500">
                  {new Date(e.logDate).toLocaleDateString("en-MY")}
                </td>
                <td className="px-4 py-2">{e.staffName}</td>
                {editingId === e.id ? (
                  <>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={0.25}
                        max={8}
                        step={0.25}
                        value={editHours}
                        onChange={(ev) => setEditHours(ev.target.value)}
                        className="w-16 rounded border border-gray-300 px-1 py-0.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(ev) => setEditNotes(ev.target.value)}
                        maxLength={500}
                        className="w-full rounded border border-gray-300 px-1 py-0.5 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={handleEditSave}
                        disabled={editSubmitting}
                        className="text-xs text-primary-600 hover:text-primary-700 font-medium mr-2"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 text-right tabular-nums">{e.hours}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{e.notes ?? "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {canEditEntry(e) && (
                        <button
                          onClick={() => startEdit(e)}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
