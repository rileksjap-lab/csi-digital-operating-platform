# CMP Excel Master Tracker — Assessment

Source: `CSI_CMP_Execution_Pack_Master_Tracker_v4_DOP_MVP.xlsx` (68,777 bytes, 21 worksheets), cross-checked against `CSI-5Year-CMP-Transformation-Plan.pdf` (Chairman's Briefing deck, 15 Jul 2026) which cites the same tabs as its data source.

## Headline finding — read this before the per-sheet detail

This workbook is **not a large legacy dataset that needs careful cleansing** — it is a **brand-new template**, created 2026-07-14 (per its own `20_Change_Log`), largely populated with `"TBD"` placeholders, single example rows, and formula scaffolding rather than real historical business data. Concretely:

- Of 21 sheets, **13 contain zero or one example/sample data row**. The rest have real content, but it's *governance/planning narrative* (milestone descriptions, risk descriptions, KPI target curves), not transactional history.
- Financial sheets (`10_BreakEven_Master`, `11_ShadowPnL`, `12_BusinessPillar_BE`) are **entirely `"TBD"` or `0`/`null`** — every cost, margin, and revenue figure is explicitly pending Finance validation. There is nothing to reconcile here yet; there's a *model* to replicate.
- The only sheet with a real, growing time series is `08_SCurve_Data` (1 of 21 quarters filled in: Baseline + Y1 Q1).

**What this means for the rest of the 15-deliverable package:** this is overwhelmingly a **schema-and-business-logic replication exercise**, not a data-migration-and-cleansing exercise. The "data quality issues" and "duplicate data" sections below are consequently short for most sheets — there isn't enough real data yet to have quality problems. The migration effort should be scoped accordingly: build the tables and formula-replication logic now; the *volume* of real data to import is currently small (a few dozen rows total across all 21 sheets) and will grow row-by-row each quarter as the tracker is actually used. Don't over-invest in bulk-import tooling for a one-time large load — invest in the recurring quarterly-update workflow instead, since that's how this data actually accumulates.

**RAG status columns are computed, not authored**, in every sheet that has one. The formula pattern is applied consistently: `IF(actual="","TBD",IF(actual>=target,"Green",IF(target-actual<=threshold,"Amber","Red")))` (threshold is usually 10 percentage points, occasionally expressed as a ratio band like `>=1.0 / >=0.7 / <0.7`). This must **not** be migrated as a stored/free-text column — it must be a server-side computed value (view, computed column, or read-time calculation), otherwise CSIDOP inherits the same "stale manually-typed RAG" risk the Excel has today. This single decision affects the "proposed data type" for a RAG column on 11 of the 21 sheets, so it's called out once here instead of repeated 11 times below.

**Cross-sheet references exist** (e.g. `01_Dashboard` pulls `='08_SCurve_Data'!C4` for its scorecard actuals; `09_KPI_Scorecard`'s "CMP Achievement Score" row pulls the same cell). In a database these become straightforward foreign-key joins / views — not a migration risk, just noted per-sheet below under "Relationships."

---

## 1. `01_Dashboard`

- **Purpose:** Executive landing view — CMP metadata (review period, baseline, deck/workbook version), the 6-category weighted scorecard, a break-even summary roll-up, and current DOP MVP status.
- **Key columns:** Category name, Weight, Planned %, Actual %, Weighted Plan, Weighted Actual, Variance (scorecard block, rows 11–20); break-even roll-up columns (rows 22–29) that all pull from `10_BreakEven_Master`.
- **Mandatory fields:** Category name, Weight (must sum to 100% across the 6 rows — currently 25/20/20/15/10/10).
- **Primary record identifier:** None natively — category name is the natural key within a single CMP plan instance.
- **Relationships:** Planned %/Actual % pull from `08_SCurve_Data!B4/C4` (baseline row) for 4 of 6 categories; 2 rows (`Process & Governance Maturity`, `Innovation & Productisation`) have manually overridden Actual values (0.40, 0.37) that **diverge from the S-Curve source** — see data-quality note below. Break-even rows pull from `10_BreakEven_Master`.
- **Formula/calculation dependencies:** `Weighted Plan = Weight × Planned%`, `Weighted Actual = Weight × Actual%`, `Variance = WeightedActual − WeightedPlan`; `Overall CMP Planned % = SUM(weighted plan)`, `Overall Actual % = SUM(weighted actual)`; overall RAG = `IF(variance>=0,"Green",IF(variance>=-0.1,"Amber","Red"))`.
- **Data-quality issues:** **Two of six scorecard rows silently hardcode a different Actual % than the S-Curve source they're supposed to pull from** (rows 15 and 17: 0.40 vs 0.35, 0.37 vs 0.35) — this is exactly the kind of manual-formula inconsistency you asked to identify. It's a real bug in the source workbook, not a migration artifact; the target system must not reproduce it (the scorecard should always derive from one canonical S-Curve value, not accept parallel manual entry).
- **Duplicate data:** The break-even summary block (rows 22–29) is a pure read-only mirror of `10_BreakEven_Master` — don't create a second table for it; render it as a view/query in the target system.
- **Proposed target table:** `cmp_scorecard_category` (6 rows) + `cmp_plan` (1 row, singleton config: review period, deck version, baseline %, etc.) — see schema doc.
- **Proposed field types:** `CategoryName varchar(100)`, `Weight numeric(5,4)`, `PlannedPct numeric(5,4)` (FK-derived, not stored — see note above), `ActualPct numeric(5,4)` (same), `SortOrder smallint`.
- **Proposed validation rule:** `SUM(Weight) OVER (plan) = 1.0` (mirrors the Role-Split 100% pattern already enforced elsewhere in CSIDOP); Actual % must equal the linked S-Curve actual unless an HOD override is explicitly logged with a reason (closing the exact loophole that caused the row-15/17 discrepancy).
- **Proposed migration treatment:** Seed the 6 categories once (they're structural, not transactional); do not import the two divergent Actual % values as-is — recompute from `08_SCurve_Data` and flag the discrepancy to HOD CSI for a decision during review.

## 2. `02_Input_Control`

- **Purpose:** The workbook's own "data entry form" — where Finance/HOD are meant to type the handful of inputs (operating cost, margin %, baseline %) that drive every downstream formula, plus a manually-maintained annual Planned/Actual/RAG table (Baseline, Year 1–5).
- **Key columns:** Input Area / Value / Owner / Validation Status (rows 4–9); Period / Planned CMP % / Actual CMP % / Variance / RAG / Review Date / Evidence Link / Notes (rows 11–17).
- **Mandatory fields:** None currently filled except Review Period ("TBD") and CMP Baseline (35%, status "Proposed" not approved).
- **Primary record identifier:** Input Area (row 4–9 block) / Period (row 11–17 block).
- **Relationships:** This sheet is the **annual-granularity twin of `08_SCurve_Data`'s quarterly table** — same Planned/Actual/RAG shape, coarser cadence. This is a genuine duplicate-structure risk: two sheets tracking overlapping progress at different granularities, already slightly diverged (this sheet's Y1 target is 50%, `08_SCurve_Data`'s Y1 Q4 target is also 50% — consistent here, but nothing enforces that).
- **Formula/calculation dependencies:** Same RAG formula pattern as elsewhere; `Variance = Actual − Planned`.
- **Data-quality issues:** Annual CSI Operating Cost, Expected Gross Margin %, Future Company Fixed Cost, Future Company Contribution Margin % are all blank ("TBD by Finance") — these are the single most load-bearing inputs in the whole workbook (every break-even formula depends on them) and none are filled in yet.
- **Duplicate data:** The annual Planned/Actual/RAG table substantially duplicates `08_SCurve_Data`'s Y-end quarters (Y1 Q4, Y2 Q4, etc.). **Recommend collapsing this into one canonical quarterly table in the target system** — an annual view is just `WHERE period LIKE '%Q4'` or a rollup query, not a separately-maintained table.
- **Proposed target table:** The 4 Finance input fields → `system_setting`-style key/value rows (`cmp_annual_operating_cost`, `cmp_expected_gross_margin_pct`, `cmp_future_company_fixed_cost`, `cmp_future_company_contribution_margin_pct`), matching the admin-configurable pattern already used elsewhere. The annual table is **not migrated as a separate table** — superseded by `cmp_scurve_period` (see sheet 8).
- **Proposed field types:** `Value numeric(15,2)`, `Owner varchar(100)`, `ValidationStatus varchar(30)`.
- **Proposed validation rule:** Values must be entered by a user with a Finance-scoped role; `ValidationStatus` transitions `TBD by Finance → Validated` only via an explicit approval action, logged to `audit_log`.
- **Proposed migration treatment:** No data to migrate (all blank). Build as an admin settings screen from day one.

## 3. `03_CMP_Master_Checklist`

- **Purpose:** The master milestone list — 14 real, filled-in rows (`CMP-001`…`CMP-014`), each a concrete transformation deliverable with an owner, target quarter, and status.
- **Key columns:** ID, Workstream, Milestone/Deliverable, Planned Period, Owner, Status, RAG, Evidence/Link, Remarks.
- **Mandatory fields:** ID, Workstream, Milestone, Planned Period, Owner, Status.
- **Primary record identifier:** ID (`CMP-001`…), sequential, no gaps, no duplicates — clean.
- **Relationships:** `CMP-006` (DOP MVP live) and `CMP-011`–`CMP-014` explicitly reference building **this exact CSIDOP module** — i.e. some milestones will be marked "done" by the module you're about to build existing. Not a data relationship, but relevant to the rollout plan: closing these 5 milestones can be an outcome of shipping CMP module Phase 1.
- **Formula/calculation dependencies:** RAG is manually typed here (not formula-derived) — inconsistent with every other sheet. This is itself a data-quality finding (see below).
- **Data-quality issues:** RAG values are free-typed and already inconsistent with Status in places — e.g. `CMP-006` Status = "Completed / MVP Live" but RAG = "Green" (consistent), while several "Not Started" rows are marked "Amber" rather than "Red", which doesn't match the RAG convention used everywhere else in the workbook (Red = blocked/not started, per the deck's own legend on slide 13). This is a real inconsistency to fix, not preserve.
- **Duplicate data:** None.
- **Proposed target table:** `cmp_milestone`.
- **Proposed field types:** `Id varchar(20)` (or replace with UUID PK + a display code `CMP-###` generated the same way `CSI_WO_No` is — auto-generated, not user-typed, closing the manual-numbering risk), `Workstream varchar(50)`, `Title varchar(300)`, `PlannedPeriod varchar(20)` (e.g. `Y1-Q1` — see cross-cutting period-format note under sheet 8), `OwnerId uuid` FK to `staff` (free-text "HOD CSI / Finance" today — needs to become a real assignee, possibly multi-owner via a join table), `Status varchar(30)`, `RagStatus` computed (not stored), `EvidenceLink text`, `Remarks text`.
- **Proposed validation rule:** `PlannedPeriod` constrained to the fixed period enum shared with `cmp_scurve_period` (Baseline, Y1 Q1…Y5 Q4). RAG computed from Status, not typed (fixes the inconsistency found above).
- **Proposed migration treatment:** Straightforward 14-row import; owner free-text needs manual mapping to real `staff` rows during migration (several are role names like "Management / HOD CSI", not individuals — may need a "responsible role" field alongside/instead of a single assignee, since CMP ownership is often organisational, not personal).

## 4. `04_Action_Log`

- **Purpose:** Monthly follow-up action tracker (mirrors CSIDOP's own WO/task pattern conceptually).
- **Key columns:** Action ID, Meeting Date, Action Description, Owner, Due Date, Priority, Status, RAG, Dependency, Next Update.
- **Mandatory fields:** Action ID, Description, Owner, Due Date, Status.
- **Primary record identifier:** Action ID (`ACT-001` — only one row exists).
- **Relationships:** Conceptually the same shape as CSIDOP's existing WO Task Checklist / My Tasks pattern — **strong candidate for reuse rather than a new table**, see functional mapping doc.
- **Formula/calculation dependencies:** None (RAG typed manually; only 1 row).
- **Data-quality issues:** None observable — too little data (1 row, mostly "TBD").
- **Duplicate data:** None.
- **Proposed target table:** `cmp_action` — but seriously consider whether this should just **be** a CSIDOP task/WO record tagged against a CMP milestone rather than a parallel table (see deliverable 4, functional mapping).
- **Proposed field types:** `Description text`, `OwnerId uuid`, `DueDate date`, `Priority varchar(10)` (reuse `CSI_WO.Priority` enum: Low/Normal/High/Urgent), `Status varchar(20)`, `Dependency text`, `NextUpdate text`.
- **Proposed validation rule:** Due date required if Status is not "Closed"; Priority constrained to the existing WO priority enum for UI/reporting consistency.
- **Proposed migration treatment:** Trivial — 1 row.

## 5. `05_Decision_Log`

- **Purpose:** Management approval/decision tracker — the record of what's being asked of the Chairman/management (this is literally slide 29's content, "Management Decisions Required").
- **Key columns:** Decision ID, Decision Required, Decision Owner, Target Review, Status, RAG, Decision Date, Decision Outcome, Remarks.
- **Mandatory fields:** Decision ID, Decision Required, Decision Owner, Status.
- **Primary record identifier:** Decision ID (`DEC-001`–`DEC-003`, 3 rows; the slide deck lists 10 decisions required — **the Excel only captures 3 of the 10 shown in the deck**, a real completeness gap between the two source artifacts).
- **Relationships:** None to other sheets directly, but conceptually gates several milestones (e.g. `DEC-002` shadow P&L approval gates `CMP-003`).
- **Formula/calculation dependencies:** None.
- **Data-quality issues:** **Incomplete — only 3 of the 10 management decisions from the approved slide deck are logged.** Recommend seeding all 10 from the deck (slide 29) during migration, not just the 3 in Excel.
- **Duplicate data:** None.
- **Proposed target table:** `cmp_decision`.
- **Proposed field types:** `DecisionText text`, `OwnerRole varchar(100)` (these are role/group owners — "Management", "Management / Finance" — not individuals), `TargetReview varchar(20)`, `Status varchar(20)`, `DecisionDate date null`, `Outcome text null`, `Remarks text`.
- **Proposed validation rule:** `DecisionDate` and `Outcome` required together once Status moves to "Decided" (same paired-field pattern as the Go/No-Go override rule already used elsewhere in this codebase).
- **Proposed migration treatment:** Import the 3 Excel rows, then add the 7 additional decisions from the slide deck (with the user's confirmation) so the log matches what's actually being asked of the Chairman.

## 6. `06_Issue_Log`

- **Purpose:** Current blockers/problems tracker.
- **Key columns:** Issue ID, Date Raised, Issue Description, Category, Impact, Owner, Target Resolution, Status, RAG, Escalation Required.
- **Mandatory fields:** Issue ID, Description, Category, Owner, Status.
- **Primary record identifier:** Issue ID (`ISS-001`, 1 row).
- **Relationships:** None structural.
- **Formula/calculation dependencies:** None.
- **Data-quality issues:** None observable (1 row).
- **Duplicate data:** None.
- **Proposed target table:** `cmp_issue`.
- **Proposed field types:** `DateRaised date`, `Description text`, `Category varchar(50)`, `Impact text`, `OwnerId uuid`, `TargetResolution date`, `Status varchar(20)`, `EscalationRequired boolean`.
- **Proposed validation rule:** `EscalationRequired = true` forces visibility on the Executive Dashboard (mirrors the deck's stated "Red risk rule" — any red item must be tabled at the next management review, slide 28).
- **Proposed migration treatment:** Trivial — 1 row.

## 7. `07_Risk_Register`

- **Purpose:** Formal risk register with quantified scoring — the most rigorously-specified sheet in the workbook.
- **Key columns:** Risk ID, Risk Category, Description, Impact (1–5), Likelihood (1–5), Risk Score, Risk Rating, Owner, Mitigation Plan, Due Date, Status, RAG.
- **Mandatory fields:** Risk ID, Category, Description, Impact, Likelihood, Owner.
- **Primary record identifier:** Risk ID (`R-001`–`R-005`, 5 real rows).
- **Relationships:** None structural to other sheets, but the slide deck (slide 22) documents a **Lessons Learned loop that closes risks back into SOPs/templates/training** — that register doesn't exist yet anywhere in the workbook (it's process-documented in the deck but has no corresponding Excel tab). This is a genuine gap between what's promised (slide 22, listed as a governance-cockpit component on slide 13) and what's built.
- **Formula/calculation dependencies:** `Risk Score = Impact × Likelihood`; `Risk Rating = IF(score>=16,"High",IF(score>=8,"Medium","Low"))`.
- **Data-quality issues:** None in the 5 rows present — this sheet is internally clean and consistent (RAG matches Rating: R-001 High/Red, R-004 High/Amber — worth flagging R-004 as High-rating-but-Amber-RAG for the user to confirm intent, since every other High-rated risk is Red).
- **Duplicate data:** None.
- **Proposed target table:** `cmp_risk`.
- **Proposed field types:** `Category varchar(50)`, `Description text`, `Impact smallint CHECK (1-5)`, `Likelihood smallint CHECK (1-5)`, `RiskScore smallint` GENERATED ALWAYS AS `(Impact*Likelihood)` STORED, `RiskRating varchar(10)` GENERATED (High/Medium/Low from score), `OwnerId uuid`, `MitigationPlan text`, `DueDate date`, `Status varchar(20)`, `RagStatus varchar(10)` (here RAG is a genuinely separate judgement call from Rating, not purely derived — keep as an editable field, unlike the other sheets).
- **Proposed validation rule:** `Impact`/`Likelihood` constrained 1–5 via CHECK constraint (same pattern as `GONOGO_EVALUATION`'s constraints elsewhere in the schema).
- **Proposed migration treatment:** Import 5 rows directly — cleanest sheet in the workbook. **Recommend also building the Lessons Learned register now** (schema doc, deliverable 5) even though the Excel has no tab for it, since the deck explicitly promises it as a governance-cockpit component (slide 13) and closing that promise is cheap once the risk register exists.

## 8. `08_SCurve_Data`

- **Purpose:** The core transformation-progress time series — quarterly Planned % vs Actual % across the full 5-year horizon (Baseline + 20 quarters). This is the "S-Curve" referenced everywhere else in the workbook and the deck (slide 14).
- **Key columns:** Period, Planned CMP %, Actual CMP %, Variance, RAG Status, Stage Label, Review Focus, Management Action.
- **Mandatory fields:** Period, Planned CMP %.
- **Primary record identifier:** Period — a **free-text string** ("Baseline", "Y1 Q1", "Y1 Q2"…) used as the row key everywhere it's cross-referenced (by `01_Dashboard`, `09_KPI_Scorecard`). This needs to become a proper structured key in the target schema (see below).
- **Relationships:** Referenced by `01_Dashboard!C12:C17` and `09_KPI_Scorecard!I4` via direct cell reference — in the target system these become a join on `(plan_id, period)` or a foreign key to `cmp_scurve_period.id`.
- **Formula/calculation dependencies:** `Variance = Actual − Planned`; RAG = the standard pattern with a 10-point threshold. The deck (slide 14) additionally documents the *source* calculation not present as a formula anywhere in Excel: `Actual CMP % = Completed Weighted CMP Milestones ÷ Total Planned Milestone Weight × 100` — i.e. the Actual % is meant to be *derived* from milestone completion (weighted), not manually typed. **The Excel doesn't implement this derivation** (Actual is hand-typed per quarter); this is the single most important piece of business logic to actually build correctly in CSIDOP that the source Excel only documents in prose.
- **Data-quality issues:** Only 2 of 21 rows have real data (Baseline, Y1 Q1); the remaining 19 are pure forward-projected targets with no actuals yet (correctly `null`, not a quality problem — this is a plan, not history). Period is unenforced free text — nothing stops a future manual entry of "Y1Q1" vs "Y1 Q1" vs "Q1 Y1", which would silently break the cross-sheet references that key off it (they're literal `!C4`-style cell references today, not lookups, so they're currently immune to this — but any migration must not carry that fragility forward).
- **Duplicate data:** Row 4 label reads "Y4 Q4" but the values (0, actual null) match what should logically be an early row — worth a manual spot-check against the live workbook during migration (possible copy-paste artifact in the source; flagged for confirmation, not asserted as certain since it may be a dump artifact from the extraction step rather than the workbook itself).
- **Proposed target table:** `cmp_scurve_period`.
- **Proposed field types:** `PeriodCode varchar(10)` CHECK against a fixed enum (`BASELINE`, `Y1Q1`…`Y5Q4` — 21 canonical values, no free text), `PeriodLabel varchar(20)` (display only), `PlannedPct numeric(5,4) NOT NULL`, `ActualPct numeric(5,4) NULL`, `StageLabel varchar(100)`, `ReviewFocus text`, `ManagementAction text`. `Variance` and `RagStatus` computed, not stored.
- **Proposed validation rule:** `PeriodCode` unique per plan; `ActualPct`, once entered, should be **system-computed from completed weighted milestones** (per the deck's own formula) with manual override requiring a logged reason — closing the gap between the deck's documented method and the Excel's actual (manual-entry) practice.
- **Proposed migration treatment:** Seed all 21 canonical periods with their Planned % targets (these are fixed 5-year plan values, safe to import verbatim); import the 2 real Actual % values; leave the rest null for quarterly entry going forward.

## 9. `09_KPI_Scorecard`

- **Purpose:** 11 KPIs spanning the balanced-scorecard perspectives (slide 11/23), each with baseline + Y1/Y2/Y3/Y5 targets and a weight.
- **Key columns:** KPI, Perspective, Weight, Baseline, Y1/Y2/Y3/Y5 Target, Current Actual, Variance vs Current Target, RAG, Evidence.
- **Mandatory fields:** KPI name, Perspective, Weight.
- **Primary record identifier:** KPI name (free text, no ID code — inconsistent with every other register sheet in the workbook, which all use `PREFIX-NNN` codes).
- **Relationships:** Row 4 ("CMP Achievement Score") pulls `Current Actual` from `='08_SCurve_Data'!C4` — the only formula-linked row; the other 10 KPIs have no actuals wired up at all (blank, not even "TBD" in most cells).
- **Formula/calculation dependencies:** `Variance = CurrentActual − Y1Target` (only meaningful once populated); RAG standard pattern.
- **Data-quality issues:** Weights across the 11 KPIs sum to 1.0 exactly (0.10+0.10+0.10+0.08×6+0.10+0.07+0.07 — verified), which is good; but targets are a mix of numeric percentages (0.3, 0.6…) and **free-text maturity descriptions** ("Not measured", "Baseline set", "Full P&L") for the financial KPIs — meaning this column cannot be a single numeric type in the target schema (see below).
- **Duplicate data:** "CMP Achievement Score" here is the same figure as `01_Dashboard`'s overall scorecard % — genuinely the same fact tracked twice; migrate as one canonical value with two display views, not two stored values.
- **Proposed target table:** `cmp_kpi` (definition: name, perspective, weight, evidence) + `cmp_kpi_target` (one row per KPI × period: baseline/Y1/Y2/Y3/Y5, target value) + `cmp_kpi_actual` (one row per KPI × period, actual value, entered quarterly/monthly per the deck's refresh cadence).
- **Proposed field types:** `TargetValueNumeric numeric(6,4) NULL` and `TargetValueText varchar(50) NULL` (exactly one of the two populated per row — handles the numeric-vs-maturity-stage mix found above; CHECK constraint enforces exactly-one-not-null).
- **Proposed validation rule:** `SUM(Weight) = 1.0` across active KPIs for a given plan (same 100%-sum pattern as scorecard categories and Role-Split).
- **Proposed migration treatment:** Import all 11 KPI definitions + their target curves verbatim (this is real planning data, safe to import); only 1 of 11 has an actual value to import.

## 10. `10_BreakEven_Master`

- **Purpose:** The three-level break-even model (slide 18): Department/Profit Centre, Future Company/Entity, plus per-pillar and payback views — 9 rows total.
- **Key columns:** Break-Even View, Annual Cost/Investment, Margin % / GP-per-unit, Break-Even Revenue/Units, Actual Revenue/Units, Progress %, Status, Validation Status, Owner, Formula/Method, Notes.
- **Mandatory fields:** View name, Owner.
- **Primary record identifier:** Break-Even View name (free text, 9 distinct values — no code).
- **Relationships:** Rows 6–10 (the 5 pillars: ICT Advisory, AI Governance, Tender Intelligence, BIM, Digital Infrastructure) **duplicate the pillar list in `12_BusinessPillar_BE`** almost exactly — this is the clearest actual overlap in the whole workbook.
- **Formula/calculation dependencies:** `BreakEvenRevenue = IFERROR(cost/margin, "TBD")`; `Progress% = IFERROR(actualRevenue/breakEvenRevenue, "TBD")`; RAG-style `Status = IF(progress="TBD","TBD",IF(progress>=1,"Green",IF(progress>=0.7,"Amber","Red")))`. Every division is `IFERROR`-wrapped specifically to degrade to `"TBD"` rather than `#DIV/0!` — a manual workaround for the fact that denominators are currently empty. In the target system this becomes a straightforward `NULL`-propagating computed column; the `IFERROR`-to-string pattern should **not** be replicated (it's an Excel-specific workaround, not business logic worth preserving).
- **Data-quality issues:** 100% `"TBD"` — every cost, margin, revenue, and progress cell across all 9 rows is unfilled. No data-quality problem (nothing to be wrong yet), but flags that **break-even tracking cannot go live in CSIDOP until Finance supplies the 4 baseline inputs from `02_Input_Control`** — a hard sequencing dependency for the rollout plan, not a technical blocker.
- **Duplicate data:** The 5 pillar rows here vs. `12_BusinessPillar_BE` — **recommend the target schema keep pillar break-even fields on `cmp_business_pillar` only**, and have `10_BreakEven_Master`'s equivalent become a filtered view (pillar-type rows) unioned with the 2 non-pillar rows (Department, Future Company) + the 2 payback rows (Platform, Training) that have no other home.
- **Proposed target table:** `cmp_breakeven_view` (rows: Department/Profit Centre, Future Company/Entity, Platform Payback, Training Payback only — 4 rows, not 9; pillar break-even lives on `cmp_business_pillar` instead).
- **Proposed field types:** `ViewType varchar(30)` enum, `AnnualCost numeric(15,2) NULL`, `MarginPct numeric(5,4) NULL`, `ActualRevenue numeric(15,2) NULL`, `Owner varchar(100)`, `FormulaMethod text`, `Notes text`. `BreakEvenRevenue`/`ProgressPct`/`Status` all computed, not stored.
- **Proposed validation rule:** `MarginPct` between 0 and 1; computed fields return `NULL` (not the string `"TBD"`) when inputs are missing — UI renders `NULL` as "TBD" for display, keeping the stored type numeric.
- **Proposed migration treatment:** Nothing to import (all blank) beyond the 4 row definitions/owners. Build the calculation engine now; data arrives once Finance validates the operating-cost baseline.

## 11. `11_ShadowPnL`

- **Purpose:** Quarterly shadow profit & loss — revenue attribution (tender/advisory/BIM/cost-optimisation/margin-protection) minus a 5-bucket cost structure, by quarter across the 5-year horizon (20 rows).
- **Key columns:** Period, 5 revenue columns, Total Value, 5 cost columns, Total Cost, Net Contribution, RAG.
- **Mandatory fields:** Period.
- **Primary record identifier:** Period (same free-text quarter labels as `08_SCurve_Data` — should share the same `PeriodCode` enum in the target schema for consistency and joinability).
- **Relationships:** Conceptually the financial counterpart to `08_SCurve_Data`'s progress tracking — same period grain, should be queryable side-by-side (e.g. "was Q3 progress matched by Q3 contribution?").
- **Formula/calculation dependencies:** `TotalValue = SUM(5 revenue cols)`; `TotalCost = SUM(5 cost cols)`; `NetContribution = TotalValue − TotalCost`; RAG = `IF(net="","TBD",IF(net>=0,"Green","Red"))` — note this RAG has **no Amber band**, unlike every other sheet's 3-band RAG. Worth confirming with the user whether that's intentional (binary pass/fail for P&L) or an oversight before replicating it.
- **Data-quality issues:** All 20 rows are `0`/`null` — every revenue and cost cell is empty, so every `TotalValue`/`TotalCost`/`NetContribution` currently computes to a misleading `0` (not `null`/`"TBD"` like the break-even sheet) — because `SUM()` over empty cells returns 0, not blank. This means the RAG on every row currently evaluates "Green" (net ≥ 0) despite having **no actual data at all** — a real, silent correctness bug in the source workbook (empty ≠ break-even). The target system must distinguish "zero contribution" from "not yet measured" (nullable columns, RAG = `NULL`/"TBD" when all inputs are null, not "Green").
- **Duplicate data:** Row labels also show the same "Y4 Q4"/quarter-mislabelling pattern as noted in `08_SCurve_Data` (e.g. a row 4 labelled differently than its position implies) — flag for the same manual spot-check.
- **Proposed target table:** `cmp_shadow_pnl_period`.
- **Proposed field types:** `PeriodCode varchar(10)` (shared enum with `cmp_scurve_period`), 5 revenue `numeric(15,2) NULL` columns, 5 cost `numeric(15,2) NULL` columns. `TotalValue`/`TotalCost`/`NetContribution`/`RagStatus` computed, with the null-vs-zero fix described above.
- **Proposed validation rule:** RAG computed as `NULL` when all revenue+cost inputs are null (not "Green") — this is the one correctness fix that must not be skipped.
- **Proposed migration treatment:** Seed 20 period rows with null financials; no real data to import yet.

## 12. `12_BusinessPillar_BE`

- **Purpose:** Per-pillar mini-P&L / break-even — the 5 CSI business pillars (Enterprise ICT Advisory, AI Governance, Tender Intelligence, BIM, Digital Infrastructure Assurance) as "mini-businesses" (slide 10, 26).
- **Key columns:** Pillar, Owner, Revenue Driver, Cost Driver, Annual Cost, Target Margin %, Break-Even Revenue, Actual Revenue, Progress %, Profit Potential, Maturity Stage, RAG.
- **Mandatory fields:** Pillar, Owner, Revenue Driver, Cost Driver.
- **Primary record identifier:** Pillar name — matches the 5 pillars named consistently across `01_Dashboard`, `10_BreakEven_Master`, `13_Service_Catalogue`, and the deck (slides 9, 10, 26). This is the cleanest, most consistently-modelled entity in the whole workbook.
- **Relationships:** Overlaps `10_BreakEven_Master` (see #10 above — recommend this table be the single source of truth for pillar break-even); referenced by name from `13_Service_Catalogue`'s "Revenue Tracker Link" column (a free-text sheet-name pointer, not a real key — becomes a proper FK in the target schema).
- **Formula/calculation dependencies:** Same break-even formula pattern as sheet 10 (`IFERROR` division → `"TBD"`), same fix applies.
- **Data-quality issues:** Annual Cost / Target Margin % / Actual Revenue all `"TBD"` for every pillar (same Finance-dependency as sheet 10); Profit Potential and Maturity Stage are free-text qualitative judgements ("Medium-High", "High Growth", "Y2-Y3") with no defined scale — fine to keep as text in the target system (not every field needs to become a strict enum), but worth normalizing "Maturity Stage" against the same 5-level maturity model the deck defines (slide 12) if the user wants pillar-level maturity gated the same way department-level maturity is.
- **Duplicate data:** See sheet 10.
- **Proposed target table:** `cmp_business_pillar` (this becomes the canonical pillar break-even table; sheet 10's pillar rows are dropped in favour of this one).
- **Proposed field types:** `PillarName varchar(100)` (5 fixed values), `OwnerId uuid` or `OwnerRoleTitle varchar(100)` (pillar owners are currently role titles like "ICT Advisory Lead", not named individuals — same pattern as milestone owners), `RevenueDriver text`, `CostDriver text`, `AnnualCost numeric(15,2) NULL`, `TargetMarginPct numeric(5,4) NULL`, `ActualRevenue numeric(15,2) NULL`, `ProfitPotential varchar(30)`, `MaturityStage varchar(30)`. Break-even/progress/RAG computed.
- **Proposed validation rule:** Same as sheet 10.
- **Proposed migration treatment:** Import the 5 pillar definitions (names, drivers, potential, stage — all real planning content); financials remain null pending Finance.

## 13. `13_Service_Catalogue`

- **Purpose:** Commercial service-line definitions with pricing logic (slide 32) — 5 rows, one per pillar.
- **Key columns:** Service Line, Example Offering, Pricing Logic, Target Customer, Owner, Status, Revenue Tracker Link, Remarks.
- **Mandatory fields:** Service Line, Example Offering, Pricing Logic.
- **Primary record identifier:** Service Line name — 1:1 with the 5 pillars.
- **Relationships:** "Revenue Tracker Link" column is a free-text sheet-name reference (`11_ShadowPnL`, `12_BusinessPillar_BE`, `14_BIM_Tracker`) — becomes a real FK to `cmp_business_pillar` in the target schema.
- **Formula/calculation dependencies:** None.
- **Data-quality issues:** All 5 rows Status = "Draft" (none approved yet — matches `DEC-003`/slide-29's pending "Approve CSI commercial service catalogue" decision). Not a quality issue, an accurate reflection of current approval state.
- **Duplicate data:** None beyond the pillar-name overlap already noted.
- **Proposed target table:** `cmp_service_catalogue_item` — could also be modelled as 1:1 attributes on `cmp_business_pillar` rather than a separate table, since it's currently exactly 5 rows mapping 1:1 to the 5 pillars; recommend a separate table only if the user expects multiple service lines per pillar in future (the deck's per-pillar "Example Offerings" grids on slides 9/10/25 suggest yes — each pillar lists 5–10 distinct offerings, so this should be modelled as many-to-one, not 1:1).
- **Proposed field types:** `PillarId uuid FK`, `OfferingName varchar(200)`, `PricingLogic text`, `TargetCustomer text`, `Status varchar(20)` (Draft/Approved/Retired).
- **Proposed validation rule:** `Status` transitions to "Approved" only via a logged decision (ties to `cmp_decision`).
- **Proposed migration treatment:** Import 5 rows as pillar-level summaries now; expand to individual offerings (per the deck's fuller lists) as a fast-follow once the user confirms the desired granularity.

## 14. `14_BIM_Tracker`

- **Purpose:** BIM project/delivery tracker with QA/QC and revenue attribution — the operational tracker behind the "BIM as profit pillar" narrative (slides 16, 17).
- **Key columns:** Project/Opportunity, BIM Service, Stage, Owner, Planned/Actual Completion, QA/QC Status, Revenue Attributed, Rework/Issues, RAG, Notes.
- **Mandatory fields:** Project/Opportunity, BIM Service, Owner.
- **Primary record identifier:** Project/Opportunity name (only 1 placeholder row, "TBD").
- **Relationships:** This is a **project-level operational tracker** — structurally very close to CSIDOP's existing `CSI_WO` / task pattern, not a governance/planning sheet like the others. Strong candidate to be implemented as **BIM-flagged Work Orders with extra QA/QC fields**, rather than a wholly separate table — see functional mapping doc.
- **Formula/calculation dependencies:** None.
- **Data-quality issues:** None observable (1 placeholder row).
- **Duplicate data:** None.
- **Proposed target table:** `cmp_bim_tracker_item` if kept standalone; recommended alternative is a `BimServiceType`/`QaQcStatus` extension on `CSI_WO` for WOs tagged to the BIM pillar (avoids maintaining two parallel work-tracking systems).
- **Proposed field types:** `ProjectName varchar(200)`, `BimService varchar(100)`, `Stage varchar(30)`, `OwnerId uuid`, `PlannedCompletion date`, `ActualCompletion date`, `QaQcStatus varchar(30)`, `RevenueAttributed numeric(15,2) NULL`, `ReworkIssues text`.
- **Proposed validation rule:** `ActualCompletion` requires `QaQcStatus != 'Pending'`.
- **Proposed migration treatment:** No real data (1 placeholder). This decision (standalone table vs. WO extension) should be made explicitly with the user before schema is finalised — flagged as an open question in the mapping doc.

## 15. `15_Resource_Plan`

- **Purpose:** Phased resourcing plan by year (Current, Y1–Y5), matching the deck's resource-layer narrative (slides 19, 20).
- **Key columns:** Year, Resource Focus, Key Additions/Capability, Resource Layer, Trigger/Gate, Owner, Status, RAG.
- **Mandatory fields:** Year, Resource Focus, Owner.
- **Primary record identifier:** Year (6 rows: Current, Y1–Y5) — clean, complete, one row per year as designed.
- **Relationships:** None structural; conceptually related to `16_Training_Cert` (both describe capability build-out, different axes — role/headcount vs. skill/certification).
- **Formula/calculation dependencies:** None.
- **Data-quality issues:** None — fully populated, consistent 6-row structure.
- **Duplicate data:** None.
- **Proposed target table:** `cmp_resource_plan_item`.
- **Proposed field types:** `YearLabel varchar(20)`, `ResourceFocus varchar(200)`, `KeyAdditions text`, `ResourceLayer varchar(50)`, `TriggerGate text`, `OwnerId uuid`, `Status varchar(20)`.
- **Proposed validation rule:** None beyond standard NOT NULL on mandatory fields.
- **Proposed migration treatment:** Clean 6-row import, no issues.

## 16. `16_Training_Cert`

- **Purpose:** Training/certification roadmap — 7 capability tracks × 5 year-stages (Foundation→Company-Ready), matching the deck's much more detailed version (slides 21, 27 — the slide deck's training roadmap has significantly more granularity, e.g. specific certifications like "TOGAF Certified", "AWS/Azure Expert Architect", than the Excel's prose-summary cells).
- **Key columns:** Capability Track, Foundation(Y1), Core(Y2), Specialist(Y3), Advanced(Y4), Company-Ready(Y5), Owner, Budget Status, RAG.
- **Mandatory fields:** Capability Track, Owner.
- **Primary record identifier:** Capability Track (7 rows, clean).
- **Relationships:** None structural; complements `15_Resource_Plan`.
- **Formula/calculation dependencies:** None.
- **Data-quality issues:** **The slide deck (slides 21, 27) contains materially more detail than the Excel tab** — the deck breaks each track into specific certifications/milestones per year (e.g. Cybersecurity: "ISO 27001 awareness → Zero Trust → SIEM/SOC certified → DR/BCP expert certified"), while the Excel has one summary phrase per cell. **Recommend using the deck's version as the source of truth for this sheet specifically** — it's more complete and was produced after the Excel (per the change log, the deck is dated the same day as "v4 DOP MVP").
- **Duplicate data:** None.
- **Proposed target table:** `cmp_training_track` (7 rows) + `cmp_training_milestone` (one row per track × year, holding the specific certification/skill target — normalizing the wide Y1–Y5 columns into rows, and pulling the richer detail from the deck rather than the thinner Excel text).
- **Proposed field types:** `TrackName varchar(100)`, `YearStage varchar(20)`, `MilestoneText text`, `OwnerId uuid`, `BudgetStatus varchar(30)`.
- **Proposed validation rule:** None beyond NOT NULL on mandatory fields.
- **Proposed migration treatment:** Re-key from the deck's richer content rather than the Excel's thinner cells — a rare case in this assessment where the "official" data source (Excel) is less complete than the reference material (deck), worth confirming with the user before building.

## 17. `17_Company_Readiness`

- **Purpose:** The company-readiness gate — 8 weighted readiness areas (Financial, Service, Market, People, Platform, BIM, Governance, Legal/Structural), matching the deck's gate model (slide 35).
- **Key columns:** Readiness Area, Gate Criteria, Weight, Current Actual, Target, Variance, Status, Evidence/Action Required, Owner.
- **Mandatory fields:** Readiness Area, Gate Criteria, Weight.
- **Primary record identifier:** Readiness Area (8 rows, weights sum to 1.0 — verified: 0.15×4 + 0.10×4 = 1.0).
- **Relationships:** "Platform Readiness" row (the only one with real data — Current 0.40) is the same fact as `21_DOP_MVP_Status`'s overall platform evidence, and conceptually the same as the DOP MVP milestone (`CMP-006`). Three places track "is the platform live" — recommend one canonical source (see sheet 21 below).
- **Formula/calculation dependencies:** Standard RAG pattern (`Variance = Current − Target`, RAG from variance).
- **Data-quality issues:** 7 of 8 rows have `Current Actual` blank (target-only, correctly reflecting "not yet assessed" rather than a data problem); Platform Readiness is the sole populated row.
- **Duplicate data:** Platform Readiness status vs. `21_DOP_MVP_Status` vs. `CMP-006` milestone — 3 representations of the same underlying fact ("is CSIDOP MVP live"), see recommendation under sheet 21.
- **Proposed target table:** `cmp_readiness_area`.
- **Proposed field types:** `AreaName varchar(50)` (8 fixed values), `GateCriteria text`, `Weight numeric(5,4)`, `CurrentActual numeric(5,4) NULL`, `Target numeric(5,4)`, `EvidenceAction text`, `OwnerId uuid`.
- **Proposed validation rule:** `SUM(Weight) = 1.0` (same pattern as scorecard/KPI weights).
- **Proposed migration treatment:** Import 8 rows; Platform Readiness's `CurrentActual` should be **computed from the DOP MVP status table** (sheet 21) rather than independently maintained, closing the 3-way duplication.

## 18. `18_Slide_Data_Map`

- **Purpose:** A reporting/export index — maps each presentation slide number to its source Excel range and update instructions. This is a **meta-sheet about the reporting process itself**, not operational CMP data.
- **Key columns:** Slide, Slide Title, Source Sheet(s), Data Range, Frequency, Owner, Update Instructions, Notes.
- **Mandatory fields:** Slide number, Source Sheet(s).
- **Primary record identifier:** Slide number.
- **Relationships:** References nearly every other sheet by name — it's the workbook's own documentation of its cross-sheet dependencies, useful as a design reference but not a data entity.
- **Formula/calculation dependencies:** None (pure documentation).
- **Data-quality issues:** N/A — not operational data.
- **Duplicate data:** N/A.
- **Proposed target table:** **None.** This sheet's entire purpose — "which data feeds which slide, and how to refresh it" — is exactly what CSIDOP's Executive Dashboard + a "generate report" export function replaces. Once CMP data lives natively in CSIDOP, there is no separate slide deck to keep in sync; the dashboard *is* the always-current view, and a PDF/PPTX export (the pattern already built for WO reports) replaces the manual "copy chart into deck" workflow this sheet documents. Migration treatment: **retire**, not migrate — but keep as a checklist when building the Executive Dashboard, to make sure every number the deck currently shows manually has a live equivalent on the new dashboard.

## 19. `19_Meeting_Minutes`

- **Purpose:** Structured minutes record for the monthly/quarterly CMP review cadence (deck slide 13's stated review cadence).
- **Key columns:** Meeting Date, Meeting Type, Attendees, Key Updates, Decisions, Risks/Issues, Actions Raised, Next Review.
- **Mandatory fields:** Meeting Date, Meeting Type.
- **Primary record identifier:** Meeting Date (1 placeholder row).
- **Relationships:** "Decisions"/"Risks/Issues"/"Actions Raised" columns conceptually should link to `cmp_decision`/`cmp_risk`/`cmp_action` records rather than be free text, once those registers exist natively.
- **Formula/calculation dependencies:** None.
- **Data-quality issues:** None observable (1 placeholder row).
- **Duplicate data:** None.
- **Proposed target table:** `cmp_meeting_minutes`, with `cmp_meeting_decision_link`, `cmp_meeting_risk_link`, `cmp_meeting_action_link` junction tables replacing the free-text columns.
- **Proposed field types:** `MeetingDate date`, `MeetingType varchar(50)`, `Attendees text`, `KeyUpdates text`, `NextReview date`.
- **Proposed validation rule:** None beyond NOT NULL on Meeting Date/Type.
- **Proposed migration treatment:** No real data yet; build the structure ahead of the first scheduled review.

## 20. `20_Change_Log`

- **Purpose:** The workbook's own version-history log (2 rows) — tracks changes to the *Excel artifact itself*, not to CMP business data.
- **Key columns:** Version, Date, Changed By, Change Summary, Affected Artifact, Approved By, Status.
- **Mandatory fields:** Version, Date, Change Summary.
- **Primary record identifier:** Version.
- **Relationships:** None to other sheets.
- **Formula/calculation dependencies:** None.
- **Data-quality issues:** Row 5's columns are shifted relative to row 4's header (values land under the wrong headers — "2026-07-14" appears under "Version", "v4 DOP MVP" under "Date") — a genuine structural error in the source file, harmless here since this sheet isn't being migrated as data.
- **Duplicate data:** N/A.
- **Proposed target table:** **None.** This is exactly what CSIDOP's existing `audit_log` (immutable, hash-chained, already built) is for. Once CMP tables live in the database, every insert/update to them is already captured there — a separate change-log sheet becomes redundant.
- **Proposed migration treatment:** Retire — no migration needed, superseded by existing infrastructure.

## 21. `21_DOP_MVP_Status`

- **Purpose:** Tracks CSIDOP's *own* build status against what the CMP plan needs from it — 10 rows, one per platform area (Overall Platform, Operations Modules, Resource & Capacity, Performance, Capability, Tender/Business, Governance Control, Financial Control, BIM Control, Company Readiness).
- **Key columns:** Area, Current Evidence/Status, CMP Impact, Next Enhancement, Owner, Target Period, RAG, Evidence/Link.
- **Mandatory fields:** Area, Current Evidence/Status.
- **Primary record identifier:** Area (10 rows).
- **Relationships:** This sheet is **literally a project-tracking artifact for the CMP module you are about to build** — "Governance Control", "Financial Control", "BIM Control", "Company Readiness" rows all say "not confirmed" / "pending module design", describing exactly the gap this 15-deliverable effort closes. It duplicates the "Platform Readiness" row of `17_Company_Readiness` and overlaps `CMP-011`–`CMP-014` milestones.
- **Formula/calculation dependencies:** None (RAG hand-typed).
- **Data-quality issues:** None structurally; it's accurate as a snapshot, but by definition goes stale the moment this module ships — several rows will need updating the day CMP Phase 1 goes live.
- **Duplicate data:** Same underlying "is the platform ready" fact as `17_Company_Readiness`'s Platform Readiness row and `03_CMP_Master_Checklist`'s `CMP-006`/`CMP-011`–`014` — **3-to-4-way duplication of the same status**, worst case in the workbook for this pattern.
- **Proposed target table:** **None as CMP business data.** Recommend this be superseded once the module ships: `CMP-011`–`014` milestones get closed out (status → Completed) as each corresponding CSIDOP capability goes live, and `17_Company_Readiness`'s Platform Readiness row becomes the single live indicator (computed, e.g., from "are the CMP module's core tables non-empty" or a simple admin-set completion flag) — not a fourth parallel tracker.
- **Proposed migration treatment:** Retire as a data table; use this document + the milestone/readiness tables as the living replacement.

---

## Cross-cutting schema decisions (apply to the whole assessment, referenced above per-sheet)

1. **RAG is always computed, never stored as free text**, except on `07_Risk_Register` where RAG is a genuine separate judgement from the numeric Risk Rating.
2. **Period keys are a fixed 21-value enum** (`BASELINE`, `Y1Q1`…`Y5Q4`), shared by `cmp_scurve_period` and `cmp_shadow_pnl_period` — not free text, closing the "Y1 Q1" vs "Y1Q1" fragility risk found in sheets 8 and 11.
3. **3 sheets (`18`, `20`, `21`) are meta/reporting artifacts, not data to migrate** — they get replaced by CSIDOP's existing dashboard/export/audit-log capabilities, not carried forward as tables.
4. **The 5 business pillars are the cleanest, most reused entity in the workbook** — appearing consistently across sheets 1, 10, 12, 13, and the deck. `cmp_business_pillar` should be treated as a core reference table other CMP tables hang off, similar to how `department`/`role` anchor the rest of CSIDOP's schema.
5. **Owners are mostly role titles, not individuals** ("HOD CSI", "Finance", "ICT Advisory Lead") — the target schema needs to decide, per table, whether to FK to `staff` (a real person) or to a free-text/role-based "responsible party" field. Recommend the latter for most CMP tables (organisational accountability, not personal task assignment), reserving `staff` FKs for the few genuinely person-level records (meeting attendees, action-log owners where a specific person is named).
6. **Nothing in this workbook conflicts with existing CSIDOP data** — no table/column name collisions, no shared identifiers with WO/Tender/Staff records apart from the deliberate, desirable links called out above (BIM tracker ↔ WO, action log ↔ tasks).
