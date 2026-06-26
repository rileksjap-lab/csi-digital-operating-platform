"use client";

import { useState } from "react";
import { apiPost, apiPatch, apiDelete } from "@/lib/api/fetcher";

interface TaskItem {
  id: string;
  taskNo: number;
  description: string;
  assignedToName: string | null;
  progress: number;
  scope: string;
  status: string;
  dateCompleted: string | null;
}

interface WoTaskChecklistProps {
  woId: string;
  tasks: TaskItem[];
  canEdit: boolean;
  canAddTask: boolean;
  onSuccess: () => void;
}

export default function WoTaskChecklist({
  woId,
  tasks,
  canEdit,
  canAddTask,
  onSuccess,
}: WoTaskChecklistProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newScope, setNewScope] = useState("Internal");
  const [adding, setAdding] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeTasks = tasks.filter((t) => t.status === "Active");
  const naTasks = tasks.filter((t) => t.status === "NA");
  const progressPercent =
    activeTasks.length > 0
      ? Math.round(
          activeTasks.reduce((sum, t) => sum + t.progress, 0) / activeTasks.length
        )
      : 0;

  async function handleProgressChange(taskId: string, progress: number) {
    setUpdatingId(taskId);
    try {
      await apiPatch(`/api/wo/${woId}/tasks/${taskId}`, { progress });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleNA(taskId: string, currentStatus: string) {
    setUpdatingId(taskId);
    try {
      const newStatus = currentStatus === "NA" ? "Active" : "NA";
      await apiPatch(`/api/wo/${woId}/tasks/${taskId}`, { status: newStatus });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteTask(taskId: string) {
    setUpdatingId(taskId);
    try {
      await apiDelete(`/api/wo/${woId}/tasks/${taskId}`);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newDesc.trim()) return;
    setAdding(true);
    try {
      await apiPost(`/api/wo/${woId}/tasks`, {
        description: newDesc.trim(),
        scope: newScope,
      });
      setNewDesc("");
      setNewScope("Internal");
      setShowAdd(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="mx-4 mt-2 text-sm text-red-600">{error}</div>
      )}

      {/* Progress summary bar */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-500">
            Overall Progress ({activeTasks.length} active task{activeTasks.length !== 1 ? "s" : ""}
            {naTasks.length > 0 && `, ${naTasks.length} N/A`})
          </span>
          <span className="text-sm font-bold text-gray-800">{progressPercent}%</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all ${
              progressPercent === 100 ? "bg-green-500" : "bg-primary-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No tasks defined
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left w-10">#</th>
              <th className="px-4 py-2 text-left">Task</th>
              <th className="px-4 py-2 text-left w-20">Scope</th>
              <th className="px-4 py-2 text-center w-32">Progress</th>
              <th className="px-4 py-2 text-center w-16">Status</th>
              {canEdit && <th className="px-4 py-2 text-right w-24">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tasks.map((t) => {
              const isNA = t.status === "NA";
              return (
                <tr
                  key={t.id}
                  className={isNA ? "bg-gray-50 opacity-60" : undefined}
                >
                  <td className="px-4 py-2 text-gray-400 tabular-nums">
                    {t.taskNo}
                  </td>
                  <td className="px-4 py-2">
                    <span className={isNA ? "line-through text-gray-400" : "text-gray-800"}>
                      {t.description}
                    </span>
                    {t.assignedToName && (
                      <span className="ml-2 text-xs text-gray-400">
                        ({t.assignedToName})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.scope === "External"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t.scope}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {isNA ? (
                      <span className="text-xs text-gray-400 text-center block">—</span>
                    ) : canEdit ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={10}
                          value={t.progress}
                          disabled={updatingId === t.id}
                          onChange={(e) =>
                            handleProgressChange(t.id, Number(e.target.value))
                          }
                          className="flex-1 h-1.5 accent-primary-600"
                        />
                        <span className="text-xs tabular-nums text-gray-600 w-8 text-right">
                          {t.progress}%
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full ${
                              t.progress === 100 ? "bg-green-500" : "bg-primary-500"
                            }`}
                            style={{ width: `${t.progress}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-gray-600 w-8 text-right">
                          {t.progress}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {isNA ? (
                      <span className="inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">
                        N/A
                      </span>
                    ) : t.progress === 100 ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Done
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Active
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => handleToggleNA(t.id, t.status)}
                        disabled={updatingId === t.id}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium mr-2"
                        title={isNA ? "Mark as Active" : "Mark as N/A"}
                      >
                        {isNA ? "Reactivate" : "N/A"}
                      </button>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        disabled={updatingId === t.id}
                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                        title="Delete task"
                      >
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Add task form */}
      {canAddTask && (
        <div className="px-4 py-3 border-t border-gray-200">
          {showAdd ? (
            <form onSubmit={handleAddTask} className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600">
                  Task Description
                </label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                  placeholder="Describe the task..."
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600">
                  Scope
                </label>
                <select
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  className="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="Internal">Internal</option>
                  <option value="External">External</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={adding}
                className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {adding ? "Adding..." : "Add"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewDesc(""); }}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
            >
              + Add Task
            </button>
          )}
        </div>
      )}
    </div>
  );
}
