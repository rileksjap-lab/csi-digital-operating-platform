"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { apiFetcher } from "@/lib/api/fetcher";

interface TaskRow {
  id: string;
  csiWoNo: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  effortHours: number;
  createdAt: string;
  updatedAt: string;
}

interface TaskSummary {
  open: number;
  inProgress: number;
  pendingApproval: number;
  dueThisWeek: number;
}

interface MyTasksData {
  tasks: TaskRow[];
  summary: TaskSummary;
}

const STATUS_COLORS: Record<string, string> = {
  Open: "bg-blue-100 text-blue-700",
  InProgress: "bg-yellow-100 text-yellow-700",
  PendingApproval: "bg-purple-100 text-purple-700",
  Closed: "bg-gray-100 text-gray-700",
};

const PRIORITY_COLORS: Record<string, string> = {
  Critical: "bg-red-100 text-red-700",
  High: "bg-orange-100 text-orange-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-green-100 text-green-700",
};

export default function MyTasksPage() {
  const [statusFilter, setStatusFilter] = useState("");

  const url = statusFilter
    ? `/api/wo/my-tasks?status=${statusFilter}`
    : "/api/wo/my-tasks";

  const { data, error, isLoading } = useSWR<MyTasksData>(url, apiFetcher);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load tasks
      </div>
    );
  }

  if (!data) return null;

  const { tasks, summary } = data;

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-gray-800">My Tasks</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Open" value={summary.open} />
        <SummaryCard label="In Progress" value={summary.inProgress} />
        <SummaryCard label="Pending Approval" value={summary.pendingApproval} />
        <SummaryCard
          label="Due This Week"
          value={summary.dueThisWeek}
          color={summary.dueThisWeek > 0 ? "text-orange-600" : "text-green-600"}
        />
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {[
          { value: "", label: "All" },
          { value: "Open", label: "Open" },
          { value: "InProgress", label: "In Progress" },
          { value: "PendingApproval", label: "Pending" },
          { value: "Closed", label: "Closed" },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s.value
                ? "bg-primary-600 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Task cards */}
      <div className="flex flex-col gap-3">
        {tasks.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center text-gray-400">
            No tasks found
          </div>
        )}
        {tasks.map((task) => (
          <Link
            key={task.id}
            href={`/wo/${task.id}`}
            className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-primary-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-xs font-mono text-gray-400 mb-0.5">{task.csiWoNo}</p>
                <p className="text-sm font-semibold text-gray-900 leading-tight">{task.title}</p>
              </div>
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status] ?? "bg-gray-100 text-gray-700"}`}>
                  {task.status === "InProgress" ? "In Progress" : task.status === "PendingApproval" ? "Pending Approval" : task.status}
                </span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[task.priority] ?? "bg-gray-100 text-gray-700"}`}>
                  {task.priority}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                {task.dueDate && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon /> Due {task.dueDate}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <ClockIcon /> {task.effortHours}h logged
                </span>
              </div>
              {task.status !== "Closed" && (
                <span className="text-xs font-semibold text-primary-600 border border-primary-200 rounded-lg px-2.5 py-1.5 hover:bg-primary-50 transition-colors">
                  + Log Hours
                </span>
              )}
            </div>
            {task.dueDate && isDueSoon(task.dueDate) && task.status !== "Closed" && (
              <div className="mt-2 flex items-center gap-1 text-xs font-medium text-orange-600">
                <WarningIcon /> {getDueLabel(task.dueDate)}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = "text-gray-900",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function isDueSoon(dateStr: string): boolean {
  const diff = new Date(dateStr).getTime() - Date.now();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

function getDueLabel(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.ceil(diff / (24 * 60 * 60 * 1000));
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? "s" : ""}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

function CalendarIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}
