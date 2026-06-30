"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: string;
  pinned: boolean;
  createdBy: string;
  staffName: string;
  staffRoleCode: string;
  createdAt: string;
  expiresAt: string | null;
  eventDate: string | null;
}

interface Props {
  canPost: boolean;
}

export default function AnnouncementBoard({ canPost }: Props) {
  const { data: items, mutate } = useSWR<Announcement[]>(
    "/api/announcements?limit=10",
    apiFetcher,
    { refreshInterval: 60000 }
  );
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);

  if (!items) return null;
  if (items.length === 0 && !canPost) return null;

  const displayed = showAll ? items : items.slice(0, 3);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <svg className="h-4 w-4 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
          Announcements
        </h2>
        {canPost && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            {showForm ? "Cancel" : "+ New"}
          </button>
        )}
      </div>

      {showForm && canPost && (
        <AnnouncementForm
          onDone={() => { setShowForm(false); mutate(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {items.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">No announcements</p>
      ) : (
        <>
          <div className="space-y-2">
            {displayed.map((a) => (
              <AnnouncementCard key={a.id} item={a} canPost={canPost} onMutate={() => mutate()} />
            ))}
          </div>
          {items.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              {showAll ? "Show less" : `View all ${items.length} announcements`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function AnnouncementCard({ item, canPost, onMutate }: {
  item: Announcement; canPost: boolean; onMutate: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const borderColor =
    item.priority === "urgent" ? "border-l-red-500" :
    item.priority === "important" ? "border-l-amber-400" :
    "border-l-gray-300";

  const bgColor =
    item.priority === "urgent" ? "bg-red-50" :
    item.priority === "important" ? "bg-amber-50" :
    "bg-white";

  async function handleDelete() {
    try {
      await fetch(`/api/announcements/${item.id}`, { method: "DELETE" });
      onMutate();
    } catch { /* ignore */ }
  }

  if (editing) {
    return (
      <AnnouncementForm
        initial={item}
        onDone={() => { setEditing(false); onMutate(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className={`rounded-lg border border-l-4 ${borderColor} ${bgColor} p-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{item.title}</h3>
            {item.pinned && (
              <span className="text-[10px] font-medium bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded">
                Pinned
              </span>
            )}
            {item.priority !== "normal" && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                item.priority === "urgent"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {item.priority === "urgent" ? "Urgent" : "Important"}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-600 line-clamp-2 whitespace-pre-wrap">{item.body}</p>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {item.eventDate && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatEventDate(item.eventDate)}
              </span>
            )}
            <span className="text-[11px] text-gray-400">
              {item.staffName} ({item.staffRoleCode}) &middot; {formatTimeAgo(item.createdAt)}
            </span>
          </div>
        </div>
        {canPost && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditing(true)}
              className="text-gray-300 hover:text-primary-500 p-0.5"
              title="Edit"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              className="text-gray-300 hover:text-red-500 p-0.5"
              title="Remove"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AnnouncementForm({ initial, onDone, onCancel }: {
  initial?: Announcement;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "normal");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [eventDate, setEventDate] = useState(
    initial?.eventDate ? toLocalDatetime(initial.eventDate) : ""
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        priority,
        pinned,
        eventDate: eventDate || null,
      };

      if (isEdit) {
        await fetch(`/api/announcements/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiPost("/api/announcements", payload);
      }
      onDone();
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Announcement title"
        maxLength={200}
        className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write your announcement..."
        maxLength={5000}
        rows={3}
        className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none resize-none"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-xs"
        >
          <option value="normal">Normal</option>
          <option value="important">Important</option>
          <option value="urgent">Urgent</option>
        </select>
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <input
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-xs focus:border-primary-500 focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)}
            className="rounded border-gray-300" />
          Pin to top
        </label>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || !title.trim() || !body.trim()}
          className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : isEdit ? "Save" : "Post"}
        </button>
      </div>
    </form>
  );
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-MY", { day: "2-digit", month: "short" });
}
