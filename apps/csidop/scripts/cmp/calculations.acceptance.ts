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
  planQuarters,
  quarterForDate,
  quarterAxisPosition,
  computeForecastScoreAt,
  computeCurveValue,
  YEAR3_GATE_PERIOD,
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

// ── S-Curve (04_DASHBOARD_SCURVE): quarterly axis, Forecast, curve sums ──

// SC01: Y1Q1 = Q3 2026 ... Y3Q4 = Q2 2029 (the Year 3 gate) ... Y5Q4 = Q2 2031.
{
  const qs = planQuarters();
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const y1q1 = qs[0];
  const gate = qs.find((q) => q.code === YEAR3_GATE_PERIOD)!;
  const last = qs[qs.length - 1];
  check(
    "SC01",
    "Quarterly axis Y1Q1..Y5Q4 with the Year 3 gate at Y3Q4",
    "20 quarters; Y1Q1 = Q3 2026 (2026-07-01..2026-09-30); Y3Q4 = Q2 2029 ends 2029-06-30; Y5Q4 = Q2 2031 ends 2031-06-30",
    { n: qs.length, y1q1: [y1q1.calendarLabel, ymd(y1q1.startDate), ymd(y1q1.endDate)], gate: [gate.code, gate.calendarLabel, ymd(gate.endDate)], last: [last.code, last.calendarLabel, ymd(last.endDate)] },
    qs.length === 20 && y1q1.code === "Y1Q1" && y1q1.calendarLabel === "Q3 2026" && ymd(y1q1.startDate) === "2026-07-01" && ymd(y1q1.endDate) === "2026-09-30" &&
      gate.code === "Y3Q4" && gate.calendarLabel === "Q2 2029" && ymd(gate.endDate) === "2029-06-30" &&
      last.code === "Y5Q4" && last.calendarLabel === "Q2 2031" && ymd(last.endDate) === "2031-06-30" &&
      qs.every((q, i) => q.code === `Y${Math.floor(i / 4) + 1}Q${(i % 4) + 1}`),
  );
}

// SC02: which quarter a date falls in; outside the plan = no quarter.
{
  const inNov = quarterForDate(new Date(2026, 10, 11));
  const before = quarterForDate(new Date(2026, 5, 30));
  const after = quarterForDate(new Date(2031, 6, 1));
  const lastDay = quarterForDate(new Date(2026, 11, 31, 23, 59));
  check("SC02", "Date to quarter", "11 Nov 2026 = Y1Q2; 30 Jun 2026 and 1 Jul 2031 = none; 31 Dec 2026 = Y1Q2",
    { inNov: inNov?.code, before: before?.code ?? null, after: after?.code ?? null, lastDay: lastDay?.code },
    inNov?.code === "Y1Q2" && before === null && after === null && lastDay?.code === "Y1Q2");
}

// SC03: a quarter-end date sits exactly on its tick; the axis is clamped to 0..20.
{
  const q1End = quarterAxisPosition(new Date(2026, 8, 30));
  const q2End = quarterAxisPosition(new Date(2026, 11, 31));
  const planEnd = quarterAxisPosition(new Date(2031, 5, 30));
  const early = quarterAxisPosition(new Date(2025, 0, 1));
  const late = quarterAxisPosition(new Date(2040, 0, 1));
  const mid = quarterAxisPosition(new Date(2026, 10, 11));
  check("SC03", "Axis position", "Y1Q1 end = 1, Y1Q2 end = 2, Y5Q4 end = 20, clamped to [0,20], 11 Nov 2026 between 1 and 2",
    { q1End, q2End, planEnd, early, late, mid },
    q1End === 1 && q2End === 2 && planEnd === 20 && early === 0 && late === 20 && mid > 1 && mid < 2);
}

// SC04: Forecast with no forecast date = Baseline (falls back to target date).
{
  const start = new Date(2026, 6, 1), target = new Date(2027, 5, 30), asOf = new Date(2027, 0, 15);
  const base = computePlannedScoreToday(start, target, asOf);
  const noForecast = computeForecastScoreAt(start, target, null, asOf);
  const undef = computeForecastScoreAt(start, target, undefined, asOf);
  check("SC04", "Forecast falls back to target date", "same as baseline", { base, noForecast, undef }, noForecast === base && undef === base);
}

// SC05: a later forecast date lowers the Forecast; an earlier one raises it; Baseline never moves (TC06).
{
  const start = new Date(2026, 6, 1), target = new Date(2027, 5, 30), asOf = new Date(2027, 0, 15);
  const base = computePlannedScoreToday(start, target, asOf);
  const slipped = computeForecastScoreAt(start, target, new Date(2027, 8, 30), asOf);
  const early = computeForecastScoreAt(start, target, new Date(2027, 2, 31), asOf);
  const items = [{ overallWeight: 1, startDate: start, targetDate: target, forecastDate: new Date(2027, 8, 30) }];
  const baselineWithForecastSet = computeCurveValue(items, "baseline", asOf);
  check("SC05", "Forecast slip / pull-in, Baseline untouched",
    "slipped < baseline < early; baseline curve identical with or without a forecast date",
    { base, slipped, early, baselineWithForecastSet },
    slipped < base && base < early && baselineWithForecastSet === base);
}

// SC06: curve value = sum(item score x overall weight); undated items add nothing; reconciles with the nested rollup.
{
  const asOf = new Date(2027, 0, 1);
  const s = new Date(2026, 6, 1), t = new Date(2027, 5, 30), t2 = new Date(2026, 11, 31);
  const w = (ws: number, it: number) => computeOverallWeight({ workstreamWeight: ws, initiativeWeight: 1, factorWeight: 1, itemWeight: it });
  const items = [
    { overallWeight: w(0.6, 0.5), startDate: s, targetDate: t, forecastDate: null },
    { overallWeight: w(0.6, 0.5), startDate: s, targetDate: t2, forecastDate: null }, // fully planned by asOf
    { overallWeight: w(0.4, 1), startDate: null, targetDate: null, forecastDate: null }, // undated
  ];
  const viaCurve = computeCurveValue(items, "baseline", asOf);
  const p1 = computePlannedScoreToday(s, t, asOf);
  const p2 = computePlannedScoreToday(s, t2, asOf);
  const nestedWs1 = rollupReadiness([{ value: p1, weight: 0.5 }, { value: p2, weight: 0.5 }]) * 0.6;
  const forecastCurve = computeCurveValue(items, "forecast", asOf);
  check("SC06", "Curve value reconciles with the nested rollup; undated items add 0; no forecasts = Forecast equals Baseline",
    "identical", { viaCurve, nestedWs1, forecastCurve },
    Math.abs(viaCurve - nestedWs1) < 1e-12 && forecastCurve === viaCurve);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
