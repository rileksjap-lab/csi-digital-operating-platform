/**
 * Runs TECH_03_ACCEPTANCE_TESTS (TC01-TC08) from
 * documents/CSI_CMP_Master_Tracker_v1.2_Execution_Ready_CSIDOP.xlsx against
 * src/lib/cmp/calculations.ts. No test framework is wired into this repo
 * yet (package.json has no test script) — this is a standalone script run
 * via `node calculations.acceptance.ts` (Node 24 strips TS types
 * natively). Exits non-zero if any check fails, so it can be wired into CI
 * later without changes.
 *
 * Lives outside src/ (mirroring how apps/csidop/worker is excluded from
 * tsconfig) because it imports its sibling with an explicit .ts extension
 * — required for Node's ESM loader to resolve it directly, but rejected
 * by this app's tsconfig (`allowImportingTsExtensions` is off, matching
 * Next.js's default bundler resolution). Keeping it out of src/ means
 * `npm run type-check` doesn't need to special-case it.
 *
 *   node scripts/cmp/calculations.acceptance.ts
 */
import {
  computeItemScore,
  computeOverallWeight,
  computeWeightedContribution,
  computePlannedScoreToday,
  computeVariance,
  computeRAG,
  validateSiblingWeights,
  canApproveBaseline,
  rollupReadiness,
  classifySubsidiaryStage,
} from "../../src/lib/cmp/calculations.ts";

let failures = 0;

function check(id: string, scenario: string, expected: string, actual: unknown, pass: boolean) {
  const status = pass ? "PASS" : "FAIL";
  if (!pass) failures++;
  console.log(`[${status}] ${id} — ${scenario}\n       expected: ${expected}\n       actual:   ${JSON.stringify(actual)}`);
}

// TC01: Sibling weights do not total 100% -> Baseline approval is blocked.
{
  const workstreams = [
    { id: "WS01", weight: 0.5 },
    { id: "WS02", weight: 0.3 }, // sums to 0.8, not 1.0
  ];
  const result = validateSiblingWeights(workstreams);
  const blocked = !canApproveBaseline([workstreams]);
  check("TC01", "Sibling weights do not total 100%", "invalid=true, baseline approval blocked", { valid: result.valid, total: result.total, blocked }, result.valid === false && blocked === true);

  // Sanity: a valid group must NOT block.
  const validGroup = [{ id: "WS01", weight: 0.6 }, { id: "WS02", weight: 0.4 }];
  const notBlocked = canApproveBaseline([validGroup]);
  check("TC01b", "Sibling weights total exactly 100%", "baseline approval allowed", { notBlocked }, notBlocked === true);
}

// TC02: Stage item set to Reviewed -> Score equals 75%.
{
  const score = computeItemScore({ scoringMethod: "Stage", currentStatus: "Reviewed" });
  check("TC02", "Stage item set to Reviewed", "0.75", score, score === 0.75);
}

// TC03: KPI target 4 and actual 2 -> Score equals 50%.
{
  const score = computeItemScore({ scoringMethod: "KPI", kpiTarget: 4, kpiActual: 2 });
  check("TC03", "KPI target 4 and actual 2", "0.5", score, score === 0.5);
}

// TC04: Critical blocker = Yes -> RAG Red while readiness score remains unchanged.
{
  const scoreBefore = computeItemScore({ scoringMethod: "Stage", currentStatus: "Draft Completed" });
  const rag = computeRAG({
    criticalBlocker: true,
    targetDate: new Date("2027-06-30"),
    variance: 0, // even with zero variance, critical blocker alone must force Red
    today: new Date("2026-08-10"),
  });
  const scoreAfter = computeItemScore({ scoringMethod: "Stage", currentStatus: "Draft Completed" });
  check(
    "TC04",
    "Critical blocker = Yes",
    "RAG=Red, score unchanged (0.5)",
    { rag, scoreBefore, scoreAfter },
    rag === "Red" && scoreBefore === scoreAfter && scoreBefore === 0.5,
  );
}

// TC05: Evidence required but not verified -> Item cannot reach full 100%.
{
  const scoreUnverified = computeItemScore({
    scoringMethod: "Stage",
    currentStatus: "Approved and Evidenced",
    evidenceStatus: "Pending",
  });
  const scoreVerified = computeItemScore({
    scoringMethod: "Stage",
    currentStatus: "Approved and Evidenced",
    evidenceStatus: "Verified",
  });
  check(
    "TC05",
    "Evidence required but not verified",
    "unverified capped below 1 (0.75), verified reaches 1",
    { scoreUnverified, scoreVerified },
    scoreUnverified === 0.75 && scoreUnverified < 1 && scoreVerified === 1,
  );
}

// Non-tracker extension: "Overdue management decision" forces RAG Red,
// per TECH_02_SCORING_AND_RAG's prose and the master prompt's RAG LOGIC
// section -- not present in the literal per-item Excel formula (which has
// no way to reference a separate sheet's row), added deliberately in
// calculations.ts's computeRAG. Score must stay untouched (RAG is an
// attention flag, same rule as TC04's critical blocker).
{
  const scoreBefore = computeItemScore({ scoringMethod: "Approval", approvalStatus: "Under Review" });
  const ragWithOverdueDecision = computeRAG({
    criticalBlocker: false,
    targetDate: new Date("2027-06-30"),
    variance: 0, // even with zero variance, an overdue decision alone must force Red
    hasOverdueDecision: true,
  });
  const ragWithoutOverdueDecision = computeRAG({
    criticalBlocker: false,
    targetDate: new Date("2027-06-30"),
    variance: 0,
    hasOverdueDecision: false,
  });
  const scoreAfter = computeItemScore({ scoringMethod: "Approval", approvalStatus: "Under Review" });
  check(
    "Overdue decision",
    "Open Decision linked to item, past due_date",
    "RAG=Red while hasOverdueDecision, RAG=Green otherwise, score unchanged (0.5) either way",
    { ragWithOverdueDecision, ragWithoutOverdueDecision, scoreBefore, scoreAfter },
    ragWithOverdueDecision === "Red" &&
      ragWithoutOverdueDecision === "Green" &&
      scoreBefore === scoreAfter &&
      scoreBefore === 0.5,
  );
}

// TC06: Forecast date changes -> Original baseline unchanged, current forecast updates.
{
  const targetDate = new Date("2027-06-30"); // baseline, from 01_PLAN_SETUP!R — never mutated
  const startDate = new Date("2026-07-01");
  const plannedBefore = computePlannedScoreToday(startDate, targetDate, new Date("2026-08-10"));

  // Owner pushes their forecast (02_PROGRESS_UPDATE!M) out by 60 days —
  // this must not mutate targetDate/startDate or the planned-score-today
  // baseline curve at all; it only feeds computeRAG's overdue check.
  const newForecastDate = new Date("2027-08-29");
  const plannedAfter = computePlannedScoreToday(startDate, targetDate, new Date("2026-08-10"));

  const ragBefore = computeRAG({ criticalBlocker: false, targetDate, forecastDate: targetDate, variance: 0 });
  const ragAfter = computeRAG({ criticalBlocker: false, targetDate, forecastDate: newForecastDate, variance: 0 });

  check(
    "TC06",
    "Forecast date changes",
    "baseline S-curve unchanged (planned before === after), RAG reacts to new forecast (Green -> Red)",
    { plannedBefore, plannedAfter, targetDateUnchanged: targetDate.toISOString(), ragBefore, ragAfter },
    plannedBefore === plannedAfter && ragBefore === "Green" && ragAfter === "Red",
  );
}

// TC07: Healthcare workstream readiness 80% but subsidiary gate not approved
//       -> Classified as subsidiary candidate, not legal subsidiary.
{
  const stageGateOpen = classifySubsidiaryStage(0.8, false);
  const stageGateApprovedButNotFullReadiness = classifySubsidiaryStage(0.8, true); // gate approved but readiness < 100%
  const stageGateApprovedAndFullReadiness = classifySubsidiaryStage(1, true);
  check(
    "TC07",
    "Healthcare workstream readiness 80%, subsidiary gate not approved",
    "Subsidiary Candidate (never Legal Subsidiary without gate approval, regardless of %)",
    { stageGateOpen, stageGateApprovedButNotFullReadiness, stageGateApprovedAndFullReadiness },
    stageGateOpen === "Subsidiary Candidate" &&
      stageGateApprovedButNotFullReadiness === "Subsidiary Candidate" &&
      stageGateApprovedAndFullReadiness === "Legal Subsidiary",
  );
}

// TC08: Snapshot saved for Q1 -> Historical S-Curve preserves prior actual progress.
{
  // cmp_snapshots (migration 035) is an append-only historical table —
  // this is a persistence-layer guarantee, not something calculations.ts
  // itself can violate, but we can prove the read-time functions are pure
  // (same inputs -> same output, no hidden mutable state) which is the
  // precondition for snapshots being trustworthy at all.
  const snapshotQ1 = { period: "Y1Q1", actualProgress: rollupReadiness([{ value: 0.4, weight: 0.5 }, { value: 0.6, weight: 0.5 }]) };
  // Recomputing the same rollup later (e.g. after Q2 data arrives) must
  // reproduce the exact same Q1 number when fed the exact same Q1 inputs.
  const recomputedQ1 = rollupReadiness([{ value: 0.4, weight: 0.5 }, { value: 0.6, weight: 0.5 }]);
  check(
    "TC08",
    "Snapshot saved for Q1, recomputed later",
    "identical actual_progress both times (pure function, no drift)",
    { snapshotQ1: snapshotQ1.actualProgress, recomputedQ1 },
    snapshotQ1.actualProgress === recomputedQ1,
  );
}

// Cross-check: Overall CMP Readiness via flattened overall_weight must
// equal the same number computed via nested per-level rollups, for a
// 2-workstream / 1-initiative / 1-factor / 2-item toy plan whose weights
// all validate. This is the reconciliation the calculations.ts doc-comment
// on rollupReadiness promises.
{
  const workstreamWeight = 0.6;
  const initiativeWeight = 1.0;
  const factorWeight = 1.0;
  const items = [
    { weight: 0.5, score: computeItemScore({ scoringMethod: "Binary", currentStatus: "Completed and Verified" }) }, // 1
    { weight: 0.5, score: computeItemScore({ scoringMethod: "Approval", approvalStatus: "Under Review" }) }, // 0.5
  ];

  const viaFlattenedOverallWeight = items.reduce((sum, it) => {
    const ow = computeOverallWeight({ workstreamWeight, initiativeWeight, factorWeight, itemWeight: it.weight });
    return sum + computeWeightedContribution(it.score, ow);
  }, 0);

  const factorReadiness = rollupReadiness(items.map((it) => ({ value: it.score, weight: it.weight })));
  const initiativeReadiness = rollupReadiness([{ value: factorReadiness, weight: factorWeight }]);
  const workstreamReadiness = rollupReadiness([{ value: initiativeReadiness, weight: initiativeWeight }]);
  const viaNestedRollup = workstreamReadiness * workstreamWeight; // this workstream's contribution to Overall CMP Readiness

  check(
    "Reconciliation",
    "flattened overall_weight sum vs nested per-level rollup",
    "identical",
    { viaFlattenedOverallWeight, viaNestedRollup },
    Math.abs(viaFlattenedOverallWeight - viaNestedRollup) < 1e-9,
  );
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
