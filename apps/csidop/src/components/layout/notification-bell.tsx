"use client";

import { useState, useRef, useEffect } from "react";
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

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data, mutate } = useSWR<NotificationsResponse>(
    "/api/notifications?limit=10",
    apiFetcher,
    { refreshInterval: 30000 }
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const unreadCount = data?.unreadCount ?? 0;

  async function handleMarkAllRead() {
    await apiPatch("/api/notifications", {});
    mutate();
  }

  async function handleMarkRead(id: string) {
    await apiPatch(`/api/notifications/${id}/read`, {});
    mutate();
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {!data || data.items.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No notifications
              </div>
            ) : (
              data.items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.isRead) handleMarkRead(n.id);
                    if (n.linkUrl) {
                      window.location.href = n.linkUrl;
                      setOpen(false);
                    }
                  }}
                  className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                    !n.isRead ? "bg-blue-50/50" : ""
                  }`}
                >
                  {!n.isRead && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                  )}
                  <div className={`flex-1 min-w-0 ${n.isRead ? "ml-5" : ""}`}>
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {n.title}
                      </p>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[n.category] ?? CATEGORY_COLORS.General}`}
                      >
                        {n.category}
                      </span>
                    </div>
                    {n.body && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">{n.body}</p>
                    )}
                    <p className="mt-1 text-[10px] text-gray-400">{timeAgo(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {data && data.total > 10 && (
            <div className="border-t border-gray-100 px-4 py-2 text-center">
              <a
                href="/notifications"
                className="text-xs text-primary-600 hover:text-primary-700"
                onClick={() => setOpen(false)}
              >
                View all notifications
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
