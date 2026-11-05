# CMP Excel-to-CSIDOP Field Mapping & Functional Mapping

Builds directly on [01_excel_tracker_assessment.md](./01_excel_tracker_assessment.md). Read that first — this document assumes its per-sheet findings (RAG-computed-not-stored, shared period enum, pillar table as anchor, 3 meta-sheets retired, etc.) without re-explaining them.

---

## Part A — Excel-to-CSIDOP field mapping

Grouped by **target table** (not by source sheet) since several sheets collapse into one table (`10_BreakEven_Master` + `12_BusinessPillar_BE`) and one sheet normalizes into two tables (`09_KPI_Scorecard` → `cmp_kpi` + `cmp_kpi_target`). Sheets 18, 20, 21 are excluded — retired per the assessment, no target table.

### `cmp_plan` (singleton config — from `01_Dashboard` rows 3–9, `02_Input_Control` rows 4–9)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| `01_Dashboard!B3` | Latest review period | text | No | `LatestReviewPeriod` | Direct | — | N/A | Import ("TBD") |
| `01_Dashboard!B6` | CMP baseline year range | text | No | `BaselineRange` | Direct | — | N/A | Import ("2026–2031") |
| `02_Input_Control!B5` | Annual CSI Operating Cost | numeric | Yes (for break-even) | `AnnualOperatingCost` | Direct | `>= 0` | N/A | Not migrated — blank in source |
| `02_Input_Control!B6` | Expected Gross Margin % | numeric | Yes (for break-even) | `ExpectedGrossMarginPct` | Direct | `0 <= x <= 1` | N/A | Not migrated — blank |
| `02_Input_Control!B7` | Future Company Fixed Cost | numeric | For Future Co break-even | `FutureCompanyFixedCost` | Direct | `>= 0` | N/A | Not migrated — blank |
| `02_Input_Control!B8` | Future Co Contribution Margin % | numeric | For Future Co break-even | `FutureCompanyContributionMarginPct` | Direct | `0 <= x <= 1` | N/A | Not migrated — blank |
| `02_Input_Control!B9` | Management-approved CMP Baseline | numeric | Yes | `ApprovedBaselinePct` | Direct | `0 <= x <= 1` | Same fact as `01_Dashboard` scorecard "Overall CMP Planned %" row 19 — one canonical value | Import (0.35, Status="Proposed" not yet approved) |

### `cmp_scorecard_category` (from `01_Dashboard` rows 12–17)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| Col A (rows 12–17) | Category name | text | Yes | `CategoryName` | Direct | 6 fixed values | N/A | Import |
| Col B | Weight | numeric | Yes | `Weight` | Direct | `SUM(Weight)=1.0` per plan | N/A | Import |
| Col C | Planned % | numeric | Yes | *(not stored)* | Derive from `cmp_scurve_period.PlannedPct` at the matching period | — | Currently duplicated 4-of-6 rows via cell ref, hand-typed on 2 rows | **Do not import Planned/Actual as stored values** — recompute from S-Curve; flag the 2 divergent rows (Process&Governance, Innovation) to HOD for a decision |
| Col D | Actual % | numeric | Yes | *(not stored)* | Same as above | — | Same | Same |

### `cmp_milestone` (from `03_CMP_Master_Checklist`)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| Col A (`CMP-001`…) | Milestone code | text | Yes | `MilestoneCode` | Preserve as display code; generate real UUID `Id` as PK | Unique | N/A | Import 14 rows |
| Col B | Workstream | text | Yes | `Workstream` | Direct | — | N/A | Import |
| Col C | Milestone/Deliverable | text | Yes | `Title` | Direct | — | N/A | Import |
| Col D | Planned Period | text | Yes | `PlannedPeriod` | Map free text ("Y1-Q1") to the shared `PeriodCode` enum (`Y1Q1`) | Must match enum | N/A | Import, normalize format |
| Col E | Owner | text | Yes | `OwnerRoleTitle` | Direct (free text — role, not individual) | — | N/A | Import; flag multi-owner rows ("HOD CSI / CBA") for a decision on whether to split |
| Col F | Status | text | Yes | `Status` | Direct | Enum: Not Started / Planned / InProgress / Completed | N/A | Import |
| Col G | RAG | text | No | *(not stored)* | Compute from Status instead of importing hand-typed value (fixes the Status/RAG inconsistency found in the assessment) | — | N/A | **Do not import as-is** |
| Col H | Evidence/Link | text | No | `EvidenceLink` | Direct | — | N/A | Import |
| Col I | Remarks | text | No | `Remarks` | Direct | — | N/A | Import |

### `cmp_action` (from `04_Action_Log`)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| Col A | Action ID | text | Yes | *(replaced by UUID PK)* | Drop free-text ID, auto-generate | — | N/A | Import 1 row |
| Col C | Description | text | Yes | `Description` | Direct | — | N/A | Import |
| Col D | Owner | text | Yes | `OwnerRoleTitle` | Direct | — | N/A | Import |
| Col E | Due Date | text ("TBD") | Yes once real | `DueDate` | Parse to date, null if "TBD" | — | N/A | Import (currently "TBD" → null) |
| Col F | Priority | text | No | `Priority` | Map to existing `CSI_WO.Priority` enum | Low/Normal/High/Urgent | N/A | Import |
| Col G | Status | text | Yes | `Status` | Direct | — | N/A | Import |
| Col H | RAG | text | No | *(not stored)* | Compute | — | N/A | Do not import as-is |
| Col I | Dependency | text | No | `Dependency` | Direct | — | N/A | Import |

### `cmp_decision` (from `05_Decision_Log` **+ slide deck slide 29**)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| `05_Decision_Log` Col A | Decision ID | text | Yes | *(replaced by UUID PK)* | Drop, auto-generate | — | N/A | Import 3 rows |
| Col B | Decision Required | text | Yes | `DecisionText` | Direct | — | Only 3 of 10 decisions logged — **supplement with the 7 additional decisions listed on slide 29 of the deck**, pending user confirmation | Import 3 + propose 7 new |
| Col C | Decision Owner | text | Yes | `OwnerRoleTitle` | Direct | — | N/A | Import |
| Col D | Target Review | text | No | `TargetReview` | Direct | — | N/A | Import |
| Col E | Status | text | Yes | `Status` | Direct | Enum: Pending/Decided | N/A | Import |
| Col G | Decision Date | date | Conditional | `DecisionDate` | Direct, null if blank | Required together with Outcome | N/A | Import (blank) |
| Col H | Decision Outcome | text | Conditional | `Outcome` | Direct | Required together with DecisionDate | N/A | Import (blank) |

### `cmp_issue` (from `06_Issue_Log`) — straightforward 1:1, see assessment sheet 6 for types; single placeholder row, import as-is.

### `cmp_risk` (from `07_Risk_Register`)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| Col A | Risk ID | text | Yes | *(replaced by UUID PK + display code)* | Auto-generate code `R-###` same pattern as WO numbering | Unique | N/A | Import 5 rows |
| Col B | Risk Category | text | Yes | `Category` | Direct | — | N/A | Import |
| Col C | Description | text | Yes | `Description` | Direct | — | N/A | Import |
| Col D | Impact (1-5) | int | Yes | `Impact` | Direct | CHECK 1–5 | N/A | Import |
| Col E | Likelihood (1-5) | int | Yes | `Likelihood` | Direct | CHECK 1–5 | N/A | Import |
| Col F | Risk Score | int | No | *(generated column)* | `Impact*Likelihood` | — | N/A | Computed, not imported |
| Col G | Risk Rating | text | No | *(generated column)* | Derived from score | — | N/A | Computed, not imported |
| Col H | Owner | text | Yes | `OwnerRoleTitle` | Direct | — | N/A | Import |
| Col I | Mitigation Plan | text | Yes | `MitigationPlan` | Direct | — | N/A | Import |
| Col J | Due Date | text ("TBD") | No | `DueDate` | Parse/null | — | N/A | Import (blank) |
| Col K | Status | text | Yes | `Status` | Direct | — | N/A | Import |
| Col L | RAG | text | Yes (this sheet only — genuine judgement, not derived) | `RagStatus` | Direct | Green/Amber/Red | N/A | Import — **keep as stored field here**, unlike every other sheet |

### `cmp_scurve_period` (from `08_SCurve_Data`)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| Col A | Period | text | Yes | `PeriodCode` | Normalize "Y1 Q1"→`Y1Q1` against fixed 21-value enum | Must match enum, unique per plan | Same period grain reused by `02_Input_Control`'s annual table and `cmp_shadow_pnl_period` | Import 21 rows (seed all periods) |
| Col B | Planned CMP % | numeric | Yes | `PlannedPct` | Direct | `0 <= x <= 1` | N/A | Import all 21 (real plan values) |
| Col C | Actual CMP % | numeric | No | `ActualPct` | Direct where present; else null | — | Consumed by `01_Dashboard`, `09_KPI_Scorecard` via reference — becomes a join, not a copy | Import 2 real values (Baseline, Y1Q1); rest null |
| Col D | Variance | numeric | No | *(computed)* | `Actual-Planned` | — | N/A | Computed |
| Col E | RAG Status | text | No | *(computed)* | Standard formula | — | N/A | Computed |
| Col F | Stage Label | text | No | `StageLabel` | Direct | — | N/A | Import |
| Col G | Review Focus | text | No | `ReviewFocus` | Direct | — | N/A | Import |
| Col H | Management Action | text | No | `ManagementAction` | Direct | — | N/A | Import |

### `cmp_kpi` + `cmp_kpi_target` + `cmp_kpi_actual` (from `09_KPI_Scorecard`, normalized from wide to long)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| Col A | KPI name | text | Yes | `cmp_kpi.Name` | Direct | Unique per plan | Row 4 duplicates `01_Dashboard`'s overall % — join, don't re-store | Import 11 |
| Col B | Perspective | text | Yes | `cmp_kpi.Perspective` | Direct | — | N/A | Import |
| Col C | Weight | numeric | Yes | `cmp_kpi.Weight` | Direct | `SUM=1.0` | N/A | Import |
| Col D–H | Baseline, Y1/Y2/Y3/Y5 Target | numeric or text | Yes | `cmp_kpi_target.TargetValueNumeric` **or** `.TargetValueText` | One row per (KPI, period); numeric cols → numeric field, maturity-stage text ("Not measured") → text field | CHECK exactly one of the two populated | N/A | Import — pivot wide columns into 4 target rows per KPI (44 rows total) |
| Col I | Current Actual | numeric | No | `cmp_kpi_actual.ActualValue` | One row per (KPI, period) entered going forward | — | Row 4 = same value as S-Curve actual — join instead of duplicate | Import 1 real value (row 4 only) |
| Col L | Evidence | text | No | `cmp_kpi.Evidence` | Direct | — | N/A | Import |

### `cmp_breakeven_view` (from `10_BreakEven_Master`, **pillar rows excluded** — see `cmp_business_pillar` below)

Only the 4 non-pillar rows (Department/Profit Centre, Future Company/Entity, Platform Payback, Training Payback) map here; columns are straightforward 1:1 (`ViewType`, `AnnualCost`, `MarginPct`, `ActualRevenue`, `Owner`, `FormulaMethod`, `Notes`), all currently blank/"TBD" — no data to migrate, only structure. See assessment sheet 10 for the `IFERROR`→null handling rule.

### `cmp_shadow_pnl_period` (from `11_ShadowPnL`)

Straightforward wide-to-columns mapping (5 revenue + 5 cost columns per period, `PeriodCode` shared with `cmp_scurve_period`). **Critical transformation rule** carried from the assessment: when all inputs for a period are null, `TotalValue`/`TotalCost`/`NetContribution`/RAG must compute to `NULL`/"TBD", **not** `0`/"Green" (the source workbook's actual bug — do not replicate). No real data to import; seed 20 period rows with nulls.

### `cmp_business_pillar` (from `12_BusinessPillar_BE`, **absorbing the pillar rows of `10_BreakEven_Master`**)

| Excel source | Business meaning | Type | Mandatory | Target field | Transformation | Validation | Duplicate handling | Migration status |
|---|---|---|---|---|---|---|---|---|
| Col A | Pillar name | text | Yes | `PillarName` | Direct | 5 fixed values, unique | Same 5 names appear in `10_BreakEven_Master` rows 6–10 — merge, single source | Import 5 rows |
| Col B | Owner | text | Yes | `OwnerRoleTitle` | Direct | — | N/A | Import |
| Col C | Revenue Driver | text | Yes | `RevenueDriver` | Direct | — | N/A | Import |
| Col D | Cost Driver | text | Yes | `CostDriver` | Direct | — | N/A | Import |
| Col E–H | Annual Cost, Target Margin%, BE Revenue, Actual Revenue | numeric | For break-even | `AnnualCost`, `TargetMarginPct`, *(computed)*, `ActualRevenue` | Direct where present | — | N/A | Import (all blank — no data yet) |
| Col J | Profit Potential | text | No | `ProfitPotential` | Direct | — | N/A | Import |
| Col K | Maturity Stage | text | No | `MaturityStage` | Direct | — | N/A | Import |

### `cmp_service_catalogue_item` (from `13_Service_Catalogue`) — 5 rows, straightforward mapping to a `PillarId` FK + `OfferingName`/`PricingLogic`/`TargetCustomer`/`Status`. Recommend expanding to the deck's fuller per-pillar offering lists (slides 9, 10, 25) as a fast-follow — see assessment sheet 13.

### `CSI_WO` extension (from `14_BIM_Tracker`) — **resolved 2026-07-16: extends `CSI_WO`**, not a standalone table (see `04_proposed_schema.sql`'s `CmpPillarId`/`CmpQaQcStatus`/`CmpRevenueAttributed` columns). No real data to migrate (1 placeholder row in the source).

### `cmp_resource_plan_item` (from `15_Resource_Plan`) — 6 clean rows, direct 1:1 mapping, no issues.

### `cmp_training_track` + `cmp_training_milestone` (from `16_Training_Cert`, **content sourced from the slide deck, not the thinner Excel cells** — see assessment sheet 16) — 7 tracks × 5 stages = 35 milestone rows, richer detail pulled from deck slides 21/27.

### `cmp_readiness_area` (from `17_Company_Readiness`) — 8 rows, direct mapping; `Platform Readiness` row's `CurrentActual` becomes a computed/admin-set value rather than a duplicate of `21_DOP_MVP_Status`.

### `cmp_meeting_minutes` (from `19_Meeting_Minutes`) — structure only, no data; free-text Decisions/Risks/Actions columns become junction-table links once those registers exist.

---

## Part B — CMP-to-CSIDOP functional mapping

| CMP functional scope (per your brief / the deck) | Maps to | New or reuse | Notes |
|---|---|---|---|
| CMP Executive Dashboard | New page `/cmp` (top-level module, sidebar entry) | New | Aggregates scorecard + S-curve + KPI + readiness; reuses CSIDOP's existing dashboard card components |
| Five-Year Roadmap | Rendered from `cmp_milestone` + `cmp_resource_plan_item` + `cmp_training_track` | New view, existing tables pattern | Timeline/roadmap visual, no new data beyond what's already scoped |
| Quarterly S-Curve | `cmp_scurve_period` + chart component | New | Actual % should be system-computed from weighted milestone completion (per the deck's own formula) once enough milestones exist to make that meaningful; manual entry with logged override in the meantime |
| Strategic Initiative Tracking | `cmp_milestone` | New table, **but same shape as `CSI_WO` conceptually** | Recommend deciding: separate `cmp_milestone` table (governance-only, no effort logging/evidence upload needed) vs. a `WO` subtype. Recommend **separate table** — milestones are strategic/quarterly-grained, WOs are operational/daily-grained; forcing them into one table would pollute WO reporting. |
| Milestone Tracking | Same as above | — | — |
| KPI Tracking | `cmp_kpi`/`cmp_kpi_target`/`cmp_kpi_actual` | New tables | **Resolved 2026-07-16: fully separate** from the existing CSIDOP `KPI` module — different weighting/scoring model, different audience (Chairman-level vs. team-level), different cadence (quarterly/annual vs. ongoing). |
| Action Tracking | `cmp_action` | New table | **Resolved 2026-07-16: standalone table**, not a WO Task Checklist reuse — kept as its own CMP-scoped action log. |
| Risk Register | `cmp_risk` | New | No existing CSIDOP risk-tracking module to reuse. |
| Financial and Break-Even Tracking | `cmp_breakeven_view` + `cmp_shadow_pnl_period` + `cmp_business_pillar` | New | Finance-role-scoped; gated behind the 4 baseline inputs being validated first. |
| Resource Planning | `cmp_resource_plan_item` | New table, **conceptually adjacent to existing Capacity module** | Existing Capacity module tracks *current* workload/utilisation per staff; this tracks the *planned future* headcount/role mix by year. Different grain — keep separate, but cross-link on the Executive Dashboard (e.g. "current utilisation vs. Year 1 resource plan"). |
| Capability and Certification Tracking | `cmp_training_track`/`cmp_training_milestone` | New table, **overlaps existing Skills module** | CSIDOP already has a Skills module (certifications/assessments/training per staff). CMP's training roadmap is department-level planning ("we need a Cybersecurity specialist by Y3"), not individual certification records. Recommend: CMP tables define the *plan*; existing Skills module tracks *actual* individual certifications; a simple query joins "how many staff hold the certs this year's plan calls for" — don't merge the tables. |
| Supporting Evidence | Reuse existing evidence-upload pattern (soft-delete, already built for WO) | Reuse | `EvidenceLink` fields across CMP tables should become real file uploads using the same soft-delete evidence infrastructure, not free-text URLs, once past MVP. |
| Reporting Periods | `cmp_scurve_period`'s `PeriodCode` enum, shared across tables | New (small) | Single canonical period table/enum, not per-sheet duplication. |
| Import Batches | `cmp_import_batch` + `cmp_import_batch_row` | New | Cross-cutting, not tied to one sheet — supports the Excel-import/validation/reconciliation deliverables (7–10), covered in the schema doc. |
| Audit Logs | Existing `audit_log` | Reuse | No new audit infrastructure — every CMP table insert/update flows through the existing immutable hash-chained log, same as every other CSIDOP table. |
| Management Reporting | Executive Dashboard + PDF/PPTX export | Reuse pattern | CSIDOP already has a report-generation pattern (WO PDF/PPTX reports, built earlier this session) — extend it to CMP data rather than building new export infrastructure. This is also the direct replacement for `18_Slide_Data_Map`'s manual refresh process. |
| Excel Import / Import Validation / Import Reconciliation | New import pipeline | New | Detailed in deliverables 7–10 (pending, post-review) — but note per the headline finding in the Excel assessment, the actual import volume today is small (~120 rows across all sheets); build the recurring-quarterly-update workflow as the primary use case, with one-time bulk import as a secondary capability, not the other way around. |

### Decisions — resolved 2026-07-16

1. **BIM Tracker** — ✅ extends `CSI_WO` (`CmpPillarId`/`CmpQaQcStatus`/`CmpRevenueAttributed` columns), no standalone table. See `04_proposed_schema.sql`.
2. **CMP KPIs vs. existing KPI module** — ✅ kept fully separate (`cmp_kpi`/`cmp_kpi_target`/`cmp_kpi_actual`).
3. **CMP Actions vs. WO Task Checklist** — ✅ standalone `cmp_action` table, not a WO-task reuse.
4. **Owner fields** — ✅ `OwnerRoleTitle varchar` free text throughout, not `staff` FKs.
5. **Decision Log completeness** — deferred. User will finalize and provide the decision list directly before migration; do not auto-seed from the Excel (3), MVP sample (6), or deck (10), which disagree on count and content.

### Access model & data-entry mechanics (from design discussion, now part of the design)

- **Two-tier access**: in-app, every authenticated CSIDOP role sees the CMP Executive subset cross-department (new sidebar entry, like the "Executive Dashboard" shared-module slot the architecture already anticipated); CSI roles get full edit, Finance gets edit on break-even/shadow-P&L fields only. A separate unauthenticated public read-only link (`CMP_PUBLIC_SHARE_LINK` table, `/cmp/public/:token` route) serves viewers with no CSIDOP account (Chairman/board) — Executive subset only, revocable/regenerable by HOD CSI, every access logged even though the viewer is anonymous.
- **Continuous, owner-driven data entry** — not a batch quarterly Excel-fill session. Milestone/risk owners update their own records as things change; HOD CSI and Finance edit per their scope.
- **Draft vs. published S-Curve** — `CMP_SCURVE_PERIOD.ActualPct` recalculates live from weighted milestone completion all quarter; `PublishedAt`/`PublishedBy` snapshot it as the official historical figure at the actual review meeting, so later milestone edits never retroactively change a reported quarter.
- **Cross-module KPI auto-derivation** — several of the 11 KPIs (Tender Contribution, Resource Utilisation, BIM metrics via the `CSI_WO` extension) should be computed live from existing Tenders/Capacity/WO data rather than manually re-typed each quarter.
