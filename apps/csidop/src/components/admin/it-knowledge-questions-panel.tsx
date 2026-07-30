"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { apiFetcher, apiPost, apiPatch } from "@/lib/api/fetcher";

interface QuestionRow {
  id: string;
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "A" | "B" | "C" | "D";
  category: string;
  isActive: boolean;
}

const CATEGORIES = ["Networking", "Security", "Cloud", "Hardware & OS", "General"];
const URL = "/api/admin/it-knowledge/questions";

export default function ItKnowledgeQuestionsPanel() {
  const { data, error, isLoading } = useSWR<QuestionRow[]>(URL, apiFetcher);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QuestionRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  if (isLoading) return <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600" /></div>;
  if (error) return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error.message}</div>;
  if (!data) return null;

  const activeCount = data.filter((q) => q.isActive).length;
  const draftCount = data.length - activeCount;

  const toggleActive = async (q: QuestionRow) => {
    setBusyId(q.id);
    try {
      await apiPatch(`${URL}/${q.id}`, { isActive: !q.isActive });
      mutate(URL);
    } finally {
      setBusyId(null);
    }
  };

  const activateAllDraft = async () => {
    setBulkBusy(true);
    try {
      await Promise.all(data.filter((q) => !q.isActive).map((q) => apiPatch(`${URL}/${q.id}`, { isActive: true })));
      mutate(URL);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This question bank feeds the self-service IT Knowledge quiz on the Skills page. Questions start as <strong>Draft</strong> and won&apos;t appear in the quiz until activated — review each one before turning it on.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600">
          <strong>{activeCount}</strong> active, <strong>{draftCount}</strong> draft
        </span>
        {draftCount > 0 && (
          <button
            onClick={activateAllDraft}
            disabled={bulkBusy}
            className="rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-50"
          >
            {bulkBusy ? "Activating..." : `Activate all ${draftCount} draft question(s)`}
          </button>
        )}
        <div className="ml-auto">
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            + Add Question
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const catQuestions = data.filter((q) => q.category === cat);
          if (catQuestions.length === 0) return null;
          return (
            <div key={cat} className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {cat} ({catQuestions.length})
              </div>
              <div className="divide-y divide-gray-100">
                {catQuestions.map((q) => (
                  <div key={q.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800">{q.questionText}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Correct: <span className="font-medium text-gray-700">{q.correctOption}) {q[`option${q.correctOption}` as "optionA"]}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${q.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {q.isActive ? "Active" : "Draft"}
                      </span>
                      <button
                        onClick={() => setEditing(q)}
                        className="text-xs font-medium text-primary-600 hover:text-primary-800"
                      >
                        Edit
                      </button>
                      <button
                        disabled={busyId === q.id}
                        onClick={() => toggleActive(q)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                      >
                        {busyId === q.id ? "..." : q.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {data.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-gray-400">No questions yet</p>
        )}
      </div>

      {(showForm || editing) && (
        <QuestionForm
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSuccess={() => { setShowForm(false); setEditing(null); mutate(URL); }}
        />
      )}
    </div>
  );
}

function QuestionForm({ initial, onClose, onSuccess }: { initial: QuestionRow | null; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    questionText: initial?.questionText ?? "",
    optionA: initial?.optionA ?? "",
    optionB: initial?.optionB ?? "",
    optionC: initial?.optionC ?? "",
    optionD: initial?.optionD ?? "",
    correctOption: initial?.correctOption ?? "A",
    category: initial?.category ?? CATEGORIES[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.questionText.trim() || !form.optionA.trim() || !form.optionB.trim() || !form.optionC.trim() || !form.optionD.trim()) {
      setError("All fields are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (initial) {
        await apiPatch(`${URL}/${initial.id}`, form);
      } else {
        await apiPost(URL, form);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save question");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{initial ? "Edit Question" : "Add Question"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Category</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="input-field mt-1"
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Question</span>
            <textarea
              value={form.questionText}
              onChange={(e) => setForm((f) => ({ ...f, questionText: e.target.value }))}
              rows={2}
              className="input-field mt-1"
            />
          </label>

          {(["A", "B", "C", "D"] as const).map((opt) => (
            <label key={opt} className="block">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="radio"
                  name="correctOption"
                  checked={form.correctOption === opt}
                  onChange={() => setForm((f) => ({ ...f, correctOption: opt }))}
                />
                Option {opt} {form.correctOption === opt && <span className="text-green-600">(correct)</span>}
              </span>
              <input
                type="text"
                value={form[`option${opt}` as "optionA"]}
                onChange={(e) => setForm((f) => ({ ...f, [`option${opt}`]: e.target.value }))}
                className="input-field mt-1"
              />
            </label>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? "Saving..." : initial ? "Save Changes" : "Add Question"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
