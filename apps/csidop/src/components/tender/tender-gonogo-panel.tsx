"use client";

import { useState } from "react";
import useSWR from "swr";
import { apiFetcher, apiPost } from "@/lib/api/fetcher";
import { useAuthStore } from "@/lib/stores/auth.store";

interface GoNoGoDetail {
  id: string;
  referenceNo: string;
  recommendation: string;
  planningHorizonDays: number;
  projectedCSIUtilization: number | null;
  projectedCMTUtilization: number | null;
  overrideBy: string | null;
  overrideByName: string | null;
  overrideReason: string | null;
  evaluatedAt: string;
  scoring: {
    functionalBreadth: number;
    integrationCount: number;
    complianceDepth: number;
    solutionNovelty: number;
    commercialComplexity: number;
    stakeholderIntensity: number;
    isRush: boolean;
    isConsortium: boolean;
    isSecurityHeavy: boolean;
    isCustomDev: boolean;
    isManyQA: boolean;
    isOnsite: boolean;
    weightedScore: number | null;
    baselineTierName: string | null;
    scoredByName: string;
    scoredAt: string;
  };
}

interface Props {
  tenderId: string;
}

const CRITERIA = [
  {
    key: "functionalBreadth",
    label: "Functional Breadth",
    description: "How many distinct functional modules or business areas does this engagement cover?",
    scale: "0 = Single function · 1–2 = Few modules · 3 = Moderate · 4 = Many modules · 5 = Enterprise-wide",
  },
  {
    key: "integrationCount",
    label: "Integration Count",
    description: "How many external systems, APIs, or third-party platforms need to be integrated?",
    scale: "0 = None · 1 = One system · 2–3 = Several · 4 = Many · 5 = Complex multi-system ecosystem",
  },
  {
    key: "complianceDepth",
    label: "Compliance Depth",
    description: "Level of regulatory, security, or standards compliance required (e.g. ISO, PDPA, SOC2).",
    scale: "0 = None · 1–2 = Basic policies · 3 = Industry standard · 4 = Strict regulation · 5 = Multi-framework audit",
  },
  {
    key: "solutionNovelty",
    label: "Solution Novelty",
    description: "How new or unfamiliar is the proposed solution to the team? Includes new tech stacks or untested approaches.",
    scale: "0 = Routine / done before · 1–2 = Minor variations · 3 = Some new elements · 4 = Mostly new · 5 = First-of-kind",
  },
  {
    key: "commercialComplexity",
    label: "Commercial Complexity",
    description: "Complexity of the commercial structure — pricing model, payment milestones, SLA penalties, multi-phase contracts.",
    scale: "0 = Simple fixed price · 1–2 = Standard terms · 3 = Moderate · 4 = Complex T&C · 5 = Multi-party / high-risk",
  },
  {
    key: "stakeholderIntensity",
    label: "Stakeholder Intensity",
    description: "Number and difficulty of stakeholders to manage — decision-makers, approval layers, cross-department coordination.",
    scale: "0 = Single contact · 1–2 = Small group · 3 = Multiple depts · 4 = Senior management · 5 = C-suite / multi-org",
  },
] as const;

const FLAGS = [
  { key: "isRush", label: "Rush", description: "Tight deadline — shorter than standard delivery timeline" },
  { key: "isConsortium", label: "Consortium", description: "Joint bid with partner companies" },
  { key: "isSecurityHeavy", label: "Security Heavy", description: "Requires penetration testing, security audits, or classified handling" },
  { key: "isCustomDev", label: "Custom Dev", description: "Requires bespoke software development (not off-the-shelf)" },
  { key: "isManyQA", label: "Many QA", description: "Extensive testing phases — UAT, SIT, regression, performance" },
  { key: "isOnsite", label: "Onsite", description: "Requires on-site presence at client location" },
] as const;

const EDIT_ROLES = ["HOD", "SolutionManager", "TeamLead", "BIMTeamLead"];

export default function TenderGoNoGoPanel({ tenderId }: Props) {
  const user = useAuthStore((s) => s.user);
  const { data: evaluations, mutate } = useSWR<GoNoGoDetail[]>(
    `/api/tender/${tenderId}/gonogo`,
    apiFetcher
  );
  const [showForm, setShowForm] = useState(false);
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scoring form state
  const [criteria, setCriteria] = useState(
    Object.fromEntries(CRITERIA.map((c) => [c.key, 0])) as Record<string, number>
  );
  const [flags, setFlags] = useState(
    Object.fromEntries(FLAGS.map((f) => [f.key, false])) as Record<string, boolean>
  );
  const [horizon, setHorizon] = useState(10);

  const canScore = user && EDIT_ROLES.includes(user.roleCode);
  const isHod = user?.roleCode === "HOD";

  async function handleScore(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost(`/api/tender/${tenderId}/score`, {
        ...criteria,
        ...flags,
        planningHorizonDays: horizon,
      });
      setShowForm(false);
      setCriteria(Object.fromEntries(CRITERIA.map((c) => [c.key, 0])));
      setFlags(Object.fromEntries(FLAGS.map((f) => [f.key, false])));
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create evaluation");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOverride(goNoGoId: string) {
    if (!overrideReason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiPost(
        `/api/tender/${tenderId}/gonogo/${goNoGoId}/override`,
        { overrideReason: overrideReason.trim() }
      );
      setOverrideId(null);
      setOverrideReason("");
      mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to override");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Go/No-Go Evaluations
        </h2>
        {canScore && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700"
          >
            New Evaluation
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 text-sm text-red-600">{error}</div>
      )}

      {/* New scoring form */}
      {showForm && (
        <form onSubmit={handleScore} className="mb-6 rounded border border-blue-200 bg-blue-50 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">
            Score New Commitment
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CRITERIA.map((c) => (
              <div key={c.key} className="rounded border border-gray-200 bg-white p-3">
                <label className="block text-xs font-semibold text-gray-700">
                  {c.label} <span className="font-normal text-gray-400">(0–5)</span>
                </label>
                <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">{c.description}</p>
                <p className="mt-1 text-[10px] text-blue-600 leading-snug">{c.scale}</p>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={criteria[c.key]}
                  onChange={(e) =>
                    setCriteria({ ...criteria, [c.key]: parseInt(e.target.value) || 0 })
                  }
                  className="mt-2 block w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-gray-700">Modifiers</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FLAGS.map((f) => (
                <label key={f.key} className="flex items-start gap-2 rounded border border-gray-200 bg-white p-2 text-xs text-gray-700 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={flags[f.key]}
                    onChange={(e) => setFlags({ ...flags, [f.key]: e.target.checked })}
                    className="mt-0.5 rounded border-gray-300"
                  />
                  <div>
                    <span className="font-medium">{f.label}</span>
                    <p className="text-[10px] text-gray-500 leading-snug mt-0.5">{f.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded border border-gray-200 bg-white p-3">
            <label className="block text-xs font-semibold text-gray-700">
              Planning Horizon <span className="font-normal text-gray-400">(1–90 days)</span>
            </label>
            <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">
              How many working days ahead should the system project resource utilization? A shorter horizon (e.g. 10 days) focuses on immediate capacity impact; a longer horizon (e.g. 60–90 days) captures sustained workload from this commitment.
            </p>
            <p className="mt-1 text-[10px] text-blue-600 leading-snug">
              Default: 10 days · Short-term: 5–15 · Medium: 20–45 · Long-term: 60–90
            </p>
            <input
              type="number"
              min={1}
              max={90}
              value={horizon}
              onChange={(e) => setHorizon(parseInt(e.target.value) || 10)}
              className="mt-2 w-28 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting ? "Evaluating..." : "Run Evaluation"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Evaluation list */}
      {!evaluations || evaluations.length === 0 ? (
        <p className="text-sm text-gray-500">No evaluations yet.</p>
      ) : (
        <div className="space-y-4">
          {evaluations.map((ev) => {
            const isOverridden = !!ev.overrideBy;
            const effectiveRec =
              ev.recommendation === "NoGo" && isOverridden
                ? "Go (Override)"
                : ev.recommendation;

            return (
              <div
                key={ev.id}
                className="rounded border border-gray-200 p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-800">
                    {ev.referenceNo}
                  </span>
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      effectiveRec.startsWith("Go")
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {effectiveRec}
                  </span>
                  {ev.scoring.baselineTierName && (
                    <span className="text-xs text-gray-500">
                      Tier: {ev.scoring.baselineTierName}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-gray-400">
                    {new Date(ev.evaluatedAt).toLocaleString("en-MY")}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-600 sm:grid-cols-6">
                  {CRITERIA.map((c) => (
                    <div key={c.key}>
                      <span className="text-gray-400">{c.label.split(" ")[0]}:</span>{" "}
                      {ev.scoring[c.key as keyof typeof ev.scoring] as number}/5
                    </div>
                  ))}
                </div>

                {ev.scoring.weightedScore != null && (
                  <div className="mt-1 text-xs text-gray-500">
                    Weighted Score: <strong>{ev.scoring.weightedScore}</strong>
                    {" | "}Scored by {ev.scoring.scoredByName}
                  </div>
                )}

                {isOverridden && (
                  <div className="mt-2 rounded bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    Overridden by {ev.overrideByName}: {ev.overrideReason}
                  </div>
                )}

                {/* Override button for HOD on NoGo evaluations */}
                {isHod &&
                  ev.recommendation === "NoGo" &&
                  !isOverridden &&
                  overrideId !== ev.id && (
                    <button
                      onClick={() => setOverrideId(ev.id)}
                      className="mt-2 rounded border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 hover:bg-yellow-100"
                    >
                      Override to Go
                    </button>
                  )}

                {overrideId === ev.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Override reason (required)"
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => handleOverride(ev.id)}
                      disabled={submitting || !overrideReason.trim()}
                      className="rounded bg-yellow-600 px-2 py-1 text-xs font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => {
                        setOverrideId(null);
                        setOverrideReason("");
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
