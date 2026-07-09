"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPatch } from "@/lib/api/fetcher";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  category: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  WorkOrder: "bg-blue-100 text-blue-700",
  Approval: "bg-purple-100 text-purple-700",
  Tender: "bg-orange-100 text-orange-700",
  System: "bg-gray-100 text-gray-600",
  General: "bg-gray-100 text-gray-600",
};

export default function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data, mutate } = useSWR<NotificationsResponse>(
    `/api/notifications?limit=${limit}&offset=${page * limit}${filter === "unread" ? "&unreadOnly=true" : ""}`,
    apiFetcher
  );

  async function handleMarkAllRead() {
    await apiPatch("/api/notifications", {});
    mutate();
  }

  async function handleMarkRead(id: string) {
    await apiPatch(`/api/notifications/${id}/read`, {});
    mutate();
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">Notifications</h1>
        <div className="flex items-center gap-3">
          {data && data.unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="rounded px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors"
            >
              Mark all as read ({data.unreadCount})
            </button>
          )}
          <div className="flex rounded-lg border border-gray-200">
            <button
              onClick={() => { setFilter("all"); setPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "all"
                  ? "bg-primary-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              } rounded-l-lg`}
            >
              All
            </button>
            <button
              onClick={() => { setFilter("unread"); setPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === "unread"
                  ? "bg-primary-600 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              } rounded-r-lg`}
            >
              Unread
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {!data ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : data.items.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {filter === "unread" ? "No unread notifications" : "No notifications yet"}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {data.items.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-5 py-4 ${
                  !n.isRead ? "bg-blue-50/40" : ""
                }`}
              >
                {!n.isRead && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                )}
                <div className={`flex-1 min-w-0 ${n.isRead ? "ml-5" : ""}`}>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{n.title}</p>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[n.category] ?? CATEGORY_COLORS.General}`}
                    >
                      {n.category}
                    </span>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-gray-500">{n.body}</p>}
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(n.createdAt).toLocaleDateString("en-MY", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!n.isRead && (
                    <button
                      onClick={() => handleMarkRead(n.id)}
                      className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      Mark read
                    </button>
                  )}
                  {n.linkUrl && (
                    <a
                      href={n.linkUrl}
                      className="rounded px-2 py-1 text-xs text-primary-600 hover:bg-primary-50"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, data?.total ?? 0)} of {data?.total ?? 0}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
