"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";

interface SkillRow {
  id: string;
  skillName: string;
  technologyDomain: string;
}

interface Props {
  staffId: string;
  staffName: string;
  domain: string;
  presetSkillId?: string;
  presetSkillName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QuickTrainingPlanModal({
  staffId,
  staffName,
  domain,
  presetSkillId,
  presetSkillName,
  onClose,
  onSuccess,
}: Props) {
  const { data: domainSkills } = useSWR<SkillRow[]>(
    presetSkillId ? null : `/api/skills?domain=${encodeURIComponent(domain)}`,
    apiFetcher
  );
  const [skillId, setSkillId] = useState(presetSkillId ?? "");
  const [plannedActivity, setPlannedActivity] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillId) {
      setError("Select a skill");
      return;
    }
    if (!plannedActivity.trim()) {
      setError("Describe the planned activity");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiPost("/api/skills/training", {
        staffId,
        skillId,
        plannedActivity: plannedActivity.trim(),
        ...(targetDate ? { targetDate } : {}),
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create training plan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Plan Training</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
            For <span className="font-medium text-gray-800">{staffName}</span> · {domain}
          </div>

          {presetSkillId ? (
            <div>
              <span className="text-sm font-medium text-gray-700">Skill</span>
              <p className="mt-1 text-sm text-gray-800">{presetSkillName}</p>
            </div>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-gray-700">
                Skill<span className="ml-0.5 text-red-500">*</span>
              </span>
              <select
                value={skillId}
                onChange={(e) => setSkillId(e.target.value)}
                className="input-field mt-1"
              >
                <option value="">Select skill...</option>
                {(domainSkills ?? []).map((sk) => (
                  <option key={sk.id} value={sk.id}>{sk.skillName}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Planned Activity<span className="ml-0.5 text-red-500">*</span>
            </span>
            <input
              type="text"
              value={plannedActivity}
              onChange={(e) => setPlannedActivity(e.target.value)}
              placeholder="e.g. Enrol in AWS Associate certification course"
              className="input-field mt-1"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Target Date</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="input-field mt-1"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
              {submitting ? "Saving..." : "Create Training Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
