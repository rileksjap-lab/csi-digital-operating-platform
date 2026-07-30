"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";

interface QuizQuestion {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  category: string;
}

interface AttemptRow {
  id: string;
  staffId: string;
  staffName: string;
  staffCode: string;
  deptCode: string;
  quarterLabel: string;
  totalQuestions: number;
  correctCount: number;
  scorePercent: number;
  level: string;
  submittedAt: string;
}

const LEVEL_COLORS: Record<string, string> = {
  Beginner: "bg-gray-100 text-gray-700",
  Intermediate: "bg-blue-100 text-blue-700",
  Advanced: "bg-green-100 text-green-700",
  Expert: "bg-purple-100 text-purple-700",
};

const QUIZ_URL = "/api/it-knowledge/quiz";
const ATTEMPTS_URL = "/api/it-knowledge/attempts";

export default function ItKnowledgeTab() {
  const user = useAuthStore((s) => s.user);
  const { data: questions, isLoading: qLoading } = useSWR<QuizQuestion[]>(QUIZ_URL, apiFetcher);
  const { data: attempts, isLoading: aLoading } = useSWR<AttemptRow[]>(ATTEMPTS_URL, apiFetcher);
  const [taking, setTaking] = useState(false);

  const myAttempt = attempts?.find((a) => a.staffId === user?.staffId);
  const hasActiveQuiz = (questions?.length ?? 0) > 0;
  const teamRows = (attempts ?? []).filter((a) => a.staffId !== user?.staffId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">General IT Knowledge Baseline</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          A short, objective quiz covering IT fundamentals — networking, security, cloud, hardware/OS. One attempt per quarter.
        </p>
      </div>

      {!qLoading && !hasActiveQuiz && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          No IT knowledge quiz is available yet — ask your HOD/Admin to activate questions under Admin → IT Knowledge Questions.
        </div>
      )}

      {hasActiveQuiz && myAttempt && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Your result this quarter ({myAttempt.quarterLabel})</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <span className="text-2xl font-bold text-gray-800">{myAttempt.scorePercent}%</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[myAttempt.level] ?? ""}`}>{myAttempt.level}</span>
            <span className="text-xs text-gray-400">{myAttempt.correctCount}/{myAttempt.totalQuestions} correct</span>
          </div>
        </div>
      )}

      {hasActiveQuiz && !myAttempt && !taking && (
        <button
          onClick={() => setTaking(true)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Take Quiz ({questions!.length} questions)
        </button>
      )}

      {taking && questions && (
        <QuizForm
          questions={questions}
          onClose={() => setTaking(false)}
          onSuccess={() => {
            setTaking(false);
            mutate(ATTEMPTS_URL);
          }}
        />
      )}

      {!aLoading && teamRows.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Team Results</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Staff</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Dept</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Quarter</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Score</th>
                  <th className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {teamRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.staffName}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{r.deptCode}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{r.quarterLabel}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums text-gray-700">{r.scorePercent}% ({r.correctCount}/{r.totalQuestions})</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_COLORS[r.level] ?? ""}`}>{r.level}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function QuizForm({ questions, onClose, onSuccess }: { questions: QuizQuestion[]; onClose: () => void; onSuccess: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const allAnswered = questions.every((q) => answers[q.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allAnswered) {
      setError("Answer every question before submitting");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiPost(ATTEMPTS_URL, { answers });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      {questions.map((q, i) => (
        <div key={q.id} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
          <p className="text-sm font-medium text-gray-800">
            {i + 1}. {q.questionText}
            <span className="ml-2 text-[11px] font-normal text-gray-400">{q.category}</span>
          </p>
          <div className="mt-2 space-y-1.5">
            {(["A", "B", "C", "D"] as const).map((opt) => (
              <label
                key={opt}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                  answers[q.id] === opt ? "border-primary-400 bg-primary-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === opt}
                  onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                />
                {q[`option${opt}` as "optionA"]}
              </label>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={submitting || !allAnswered} className="btn-primary disabled:opacity-50">
          {submitting ? "Submitting..." : "Submit Quiz"}
        </button>
      </div>
    </form>
  );
}
