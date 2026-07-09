"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";

interface DiscussionPost {
  id: string;
  parentId: string | null;
  postedBy: string;
  staffName: string;
  staffRoleCode: string;
  body: string;
  isEdited: boolean;
  createdAt: string;
  replies: DiscussionPost[];
}

interface StaffOption {
  Id: string;
  Name: string;
  RoleCode: string;
}

interface WoDiscussionProps {
  woId: string;
  currentStaffId: string;
}

export default function WoDiscussion({ woId, currentStaffId }: WoDiscussionProps) {
  const { data: posts, mutate } = useSWR<DiscussionPost[]>(
    `/api/wo/${woId}/discussion`,
    apiFetcher,
    { refreshInterval: 15000 }
  );

  const { data: staffList } = useSWR<StaffOption[]>("/api/staff", apiFetcher);

  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiPost(`/api/wo/${woId}/discussion`, { body: body.trim() });
      setBody("");
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      {/* Post form */}
      <form onSubmit={handlePost} className="border-b border-gray-200 px-4 py-3">
        <MentionInput
          value={body}
          onChange={setBody}
          staffList={staffList ?? []}
          placeholder="Write a comment... (use @ to mention)"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-400">Tip: type @ to mention someone</p>
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting ? "Posting..." : "Post"}
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </form>

      {/* Posts list */}
      {!posts ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">Loading...</div>
      ) : posts.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No comments yet — start the discussion
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {posts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              woId={woId}
              currentStaffId={currentStaffId}
              staffList={staffList ?? []}
              onReply={() => mutate()}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mention Input with autocomplete ─────────────────────────────────────────

function MentionInput({
  value,
  onChange,
  staffList,
  placeholder,
  autoFocus,
  singleLine,
}: {
  value: string;
  onChange: (v: string) => void;
  staffList: StaffOption[];
  placeholder?: string;
  autoFocus?: boolean;
  singleLine?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filtered = mentionQuery !== null
    ? staffList.filter((s) =>
        s.Name.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const handleChange = useCallback(
    (text: string) => {
      onChange(text);
      const el = ref.current;
      if (!el) return;
      const pos = el.selectionStart ?? text.length;
      const before = text.slice(0, pos);
      const atMatch = before.match(/@(\w*)$/);
      if (atMatch) {
        setMentionQuery(atMatch[1]);
        setMentionStart(pos - atMatch[0].length);
        setSelectedIdx(0);
      } else {
        setMentionQuery(null);
      }
    },
    [onChange]
  );

  function insertMention(staff: StaffOption) {
    const before = value.slice(0, mentionStart);
    const after = value.slice((ref.current?.selectionStart ?? value.length));
    const newValue = `${before}@${staff.Name} ${after}`;
    onChange(newValue);
    setMentionQuery(null);
    ref.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery === null || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filtered[selectedIdx]);
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }
  }

  const inputClass =
    "w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-primary-500 focus:outline-none resize-none";

  return (
    <div className="relative">
      {singleLine ? (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={5000}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={inputClass}
        />
      ) : (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={5000}
          rows={2}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={inputClass}
        />
      )}

      {mentionQuery !== null && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s.Id}
              type="button"
              onClick={() => insertMention(s)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                i === selectedIdx ? "bg-primary-50 text-primary-700" : "hover:bg-gray-50"
              }`}
            >
              <span className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                {s.Name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <span className="font-medium">{s.Name}</span>
              <span className="text-xs text-gray-400">{s.RoleCode}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Post Item ───────────────────────────────────────────────────────────────

function PostItem({
  post,
  woId,
  currentStaffId,
  staffList,
  onReply,
  depth,
}: {
  post: DiscussionPost;
  woId: string;
  currentStaffId: string;
  staffList: StaffOption[];
  onReply: () => void;
  depth: number;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const initials = post.staffName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isOwn = post.postedBy === currentStaffId;
  const ml = depth > 0 ? "ml-8" : "";

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setSubmitting(true);
    try {
      await apiPost(`/api/wo/${woId}/discussion`, {
        body: replyBody.trim(),
        parentId: post.id,
      });
      setReplyBody("");
      setShowReply(false);
      onReply();
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  }

  const timeAgo = formatTimeAgo(post.createdAt);

  return (
    <>
      <div className={`px-4 py-3 ${ml}`}>
        <div className="flex items-start gap-3">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              isOwn
                ? "bg-primary-100 text-primary-700"
                : "bg-gray-200 text-gray-600"
            }`}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">
                {post.staffName}
              </span>
              <span className="text-xs text-gray-400">{post.staffRoleCode}</span>
              <span className="text-xs text-gray-400">{timeAgo}</span>
              {post.isEdited && (
                <span className="text-xs text-gray-400 italic">(edited)</span>
              )}
            </div>
            <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap break-words">
              <MentionText text={post.body} />
            </div>
            {depth < 2 && (
              <button
                onClick={() => setShowReply(!showReply)}
                className="mt-1 text-xs text-primary-600 hover:text-primary-700 font-medium"
              >
                Reply
              </button>
            )}

            {showReply && (
              <form onSubmit={handleReply} className="mt-2 flex gap-2">
                <div className="flex-1">
                  <MentionInput
                    value={replyBody}
                    onChange={setReplyBody}
                    staffList={staffList}
                    placeholder="Write a reply... (@ to mention)"
                    autoFocus
                    singleLine
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !replyBody.trim()}
                  className="self-start rounded bg-primary-600 px-3 py-2 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Reply
                </button>
                <button
                  type="button"
                  onClick={() => setShowReply(false)}
                  className="self-start text-xs text-gray-500 hover:text-gray-700 py-2"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {post.replies.map((reply) => (
        <PostItem
          key={reply.id}
          post={reply}
          woId={woId}
          currentStaffId={currentStaffId}
          staffList={staffList}
          onReply={onReply}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

// ─── Render @mentions as highlighted text ────────────────────────────────────

function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@\w[\w\s]*?\w(?=\s|$|@)|@\w+)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="font-semibold text-primary-600">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

// ─── Time ago helper ─────────────────────────────────────────────────────────

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  return new Date(dateStr).toLocaleDateString("en-MY", {
    day: "2-digit",
    month: "short",
  });
}
