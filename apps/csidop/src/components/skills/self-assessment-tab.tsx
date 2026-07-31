"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { apiFetcher, apiPost, apiPatch } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";
import {
  RUBRIC_QUESTIONS,
  RUBRIC_ANSWER_SCALE,
  RUBRIC_MAX_SCORE,
  computeSuggestedLevel,
  currentQuarterLabel,
} from "@/lib/skills/rubric";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SkillRow {
  id: string;
  skillName: string;
  technologyDomain: string;
}

interface SelfAssessmentRow {
  id: string;
  staffId: string;
  staffName: string;
  staffCode: string;
  deptCode: string;
  skillId: string;
  skillName: string;
  technologyDomain: string;
  quarterLabel: string;
  answers: Record<string, number>;
  totalScore: number;
  suggestedLevel: string;
  status: "PendingReview" | "Confirmed" | "Rejected";
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  submittedAt: string;
}

const REVIEW_ROLES = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];
const BIM_APP_ROLES = ["BIMModeler", "BIMTeamLead"];

const DOMAINS = [
  "Cloud",
  "Cyber Security",
  "Data Centre",
  "Network",
  "Enterprise Architecture",
  "AI / HPC",
  "BIM",
  "Consultancy",
  "Soft Skills",
];

const NON_BIM_DOMAINS = DOMAINS.filter((d) => d !== "BIM");

const LEVEL_COLORS: Record<string, string> = {
  Beginner: "bg-gray-100 text-gray-700",
  Intermediate: "bg-blue-100 text-blue-700",
  Advanced: "bg-green-100 text-green-700",
  Expert: "bg-purple-100 text-purple-700",
};

const STATUS_COLORS: Record<string, string> = {
  PendingReview: "bg-yellow-100 text-yellow-700",
  Confirmed: "bg-green-100 text-green-700",
  Rejected: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  PendingReview: "Pending Review",
  Confirmed: "Confirmed",
  Rejected: "Rejected",
};

// ─── Main tab ───────────────────────────────────────────────────────────────

export default function SelfAssessmentTab() {
  const user = useAuthStore((s) => s.user);
  const isReviewer = user ? REVIEW_ROLES.includes(user.role) : false;
  const isBim = user ? BIM_APP_ROLES.includes(user.role) : false;
  const applicableDomains = isBim ? ["BIM"] : NON_BIM_DOMAINS;
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const myUrl = user ? `/api/skills/self-assessments?staffId=${user.staffId}` : null;
  const pendingUrl = isReviewer ? `/api/skills/self-assessments?status=PendingReview` : null;

  const { data: mine, error: mineError, isLoading: mineLoading } = useSWR<SelfAssessmentRow[]>(myUrl, apiFetcher);
  const { data: pending, isLoading: pendingLoading } = useSWR<SelfAssessmentRow[]>(pendingUrl, apiFetcher);

  const pendingCount = (pending ?? []).length;
  const quarter = currentQuarterLabel();
  const coveredDomains = new Set(
    (mine ?? []).filter((r) => r.quarterLabel === quarter).map((r) => r.technologyDomain)
  );

  const refresh = () => {
    if (myUrl) mutate(myUrl);
    if (pendingUrl) mutate(pendingUrl);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Quarterly Self-Assessment</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Assess yourself against any skill once per quarter. Your Team Lead / HOD reviews and confirms the result before it counts.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          <PlusIcon /> Take Assessment
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Domain Coverage — {quarter}</h2>
          <span className="text-xs text-gray-400">{coveredDomains.size} / {applicableDomains.length} covered</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {applicableDomains.map((d) => {
            const done = coveredDomains.has(d);
            return (
              <span
                key={d}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  done ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {done ? "✓" : "○"} {d}
              </span>
            );
          })}
        </div>
      </div>

      {isReviewer && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-700">Pending Review</h2>
            {pendingCount > 0 && (
              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-700">
                {pendingCount}
              </span>
            )}
          </div>
          {pendingLoading && <Spinner />}
          {!pendingLoading && pendingCount === 0 && (
            <p className="text-xs italic text-gray-400">Nothing waiting on your review.</p>
          )}
          {pendingCount > 0 && (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {pending!.map((r) => (
                <ReviewRow
                  key={r.id}
                  row={r}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  onDone={refresh}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-700">My Submissions</h2>
        {mineLoading && <Spinner />}
        {mineError && <ErrorBox message={mineError.message} />}
        {mine && mine.length === 0 && (
          <p className="text-xs italic text-gray-400">You haven&apos;t submitted a self-assessment yet.</p>
        )}
        {mine && mine.length > 0 && (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {mine.map((r) => (
              <SubmissionRow
                key={r.id}
                row={r}
                expanded={expandedId === r.id}
                onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <AssessmentQuestionnaire
          allowedDomains={applicableDomains}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Questionnaire form ─────────────────────────────────────────────────────

function AssessmentQuestionnaire({
  onClose,
  onSuccess,
  allowedDomains,
}: {
  onClose: () => void;
  onSuccess: () => void;
  allowedDomains: string[];
}) {
  const locked = allowedDomains.length === 1;
  const [domainFilter, setDomainFilter] = useState(locked ? allowedDomains[0] : "");
  const skillUrl = domainFilter ? `/api/skills?domain=${encodeURIComponent(domainFilter)}` : null;
  const { data: skillList } = useSWR<SkillRow[]>(skillUrl, apiFetcher);
  const [skillId, setSkillId] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const allAnswered = RUBRIC_QUESTIONS.every((q) => answers[q.key] !== undefined);
  const totalScore = RUBRIC_QUESTIONS.reduce((sum, q) => sum + (answers[q.key] ?? 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillId) {
      setError("Select a skill first");
      return;
    }
    if (!allAnswered) {
      setError("Answer every question before submitting");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiPost("/api/skills/self-assessments", { skillId, answers });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit assessment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SlideOver title="Take Self-Assessment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Domain" required>
            <select
              value={domainFilter}
              onChange={(e) => {
                setDomainFilter(e.target.value);
                setSkillId("");
              }}
              disabled={locked}
              className="input-field disabled:bg-gray-100 disabled:text-gray-500"
            >
              {!locked && <option value="">Select domain...</option>}
              {allowedDomains.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Skill" required>
            <select
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              disabled={!domainFilter}
              className="input-field disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">{domainFilter ? "Select skill..." : "Pick a domain first"}</option>
              {(skillList ?? []).map((sk) => (
                <option key={sk.id} value={sk.id}>{sk.skillName}</option>
              ))}
            </select>
          </Field>
        </div>

        {skillId && (
          <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            {RUBRIC_QUESTIONS.map((q, i) => (
              <div key={q.key}>
                <p className="text-sm font-medium text-gray-800">
                  {i + 1}. {q.text}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {RUBRIC_ANSWER_SCALE.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setAnswers((a) => ({ ...a, [q.key]: opt.value }))}
                      className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                        answers[q.key] === opt.value
                          ? "border-primary-400 bg-primary-50 font-medium text-primary-700"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-xs text-gray-500">
              <span>Score: {totalScore} / {RUBRIC_MAX_SCORE}</span>
              {allAnswered && (
                <span className="font-medium text-gray-700">
                  Suggested level: {computeSuggestedLevel(totalScore)}
                </span>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting || !skillId || !allAnswered} className="btn-primary disabled:opacity-50">
            {submitting ? "Submitting..." : "Submit Assessment"}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}

// ─── Reviewer row (manager view) ────────────────────────────────────────────

function ReviewRow({
  row,
  expanded,
  onToggle,
  onDone,
}: {
  row: SelfAssessmentRow;
  expanded: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const decide = async (decision: "Confirmed" | "Rejected") => {
    if (decision === "Rejected" && !reason.trim()) {
      setError("A reason is required to reject");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiPatch(
        `/api/skills/self-assessments/${row.id}`,
        decision === "Rejected" ? { decision, reviewNote: reason.trim() } : { decision }
      );
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">
            {row.staffName} <span className="text-xs text-gray-400">({row.deptCode})</span>
          </p>
          <p className="text-xs text-gray-500">{row.skillName} · {row.technologyDomain} · {row.quarterLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={LEVEL_COLORS[row.suggestedLevel] ?? ""}>
            {row.suggestedLevel} ({row.totalScore}/{RUBRIC_MAX_SCORE})
          </Badge>
          <button onClick={onToggle} className="text-xs font-medium text-primary-600 hover:text-primary-800">
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {expanded && <AnswerBreakdown answers={row.answers} />}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!rejecting ? (
          <>
            <button
              disabled={busy}
              onClick={() => decide("Confirmed")}
              className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {busy ? "..." : "Confirm"}
            </button>
            <button
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Reject
            </button>
          </>
        ) : (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for rejecting..."
              className="input-field min-w-[200px] flex-1 text-xs"
            />
            <button
              disabled={busy}
              onClick={() => decide("Rejected")}
              className="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "..." : "Confirm Reject"}
            </button>
            <button
              onClick={() => { setRejecting(false); setReason(""); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── Submission row (staff's own view) ──────────────────────────────────────

function SubmissionRow({
  row,
  expanded,
  onToggle,
}: {
  row: SelfAssessmentRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{row.skillName}</p>
          <p className="text-xs text-gray-500">
            {row.technologyDomain} · {row.quarterLabel} · submitted {row.submittedAt.slice(0, 10)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={LEVEL_COLORS[row.suggestedLevel] ?? ""}>{row.suggestedLevel}</Badge>
          <Badge className={STATUS_COLORS[row.status] ?? ""}>{STATUS_LABELS[row.status] ?? row.status}</Badge>
          <button onClick={onToggle} className="text-xs font-medium text-primary-600 hover:text-primary-800">
            {expanded ? "Hide" : "Details"}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          <AnswerBreakdown answers={row.answers} />
          {row.status === "Rejected" && row.reviewNote && (
            <p className="mt-2 border-t border-gray-200 pt-2 text-xs text-red-600">
              <strong>Rejected:</strong> {row.reviewNote}
            </p>
          )}
          {row.status === "Confirmed" && row.reviewedByName && (
            <p className="mt-2 border-t border-gray-200 pt-2 text-xs text-gray-500">
              Confirmed by {row.reviewedByName}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function AnswerBreakdown({ answers }: { answers: Record<string, number> }) {
  return (
    <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
      {RUBRIC_QUESTIONS.map((q) => (
        <div key={q.key} className="flex items-start justify-between gap-3 text-xs">
          <span className="text-gray-600">{q.text}</span>
          <span className="shrink-0 font-medium text-gray-800">{answers[q.key] ?? "—"} / 3</span>
        </div>
      ))}
    </div>
  );
}

// ─── Shared presentational primitives ───────────────────────────────────────

function SlideOver({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col bg-white shadow-xl animate-slide-in">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
    </div>
  );
}

function ErrorBox({ message }: { message?: string }) {
  return (
    <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message ?? "Failed to load data"}
    </div>
  );
}
