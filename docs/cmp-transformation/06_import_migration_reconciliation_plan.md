# Excel Import Design, Validation Rules, Migration Plan, Reconciliation Plan (deliverables 7–10)

These four are one connected pipeline — covered together rather than as four separate documents, since splitting them would mean repeating the same flow four times. Follows the process you specified: **Excel Master Tracker → Data Profiling → Data Cleansing → Field Mapping → Staging Import → Validation → Reconciliation → Production Migration → UAT → Final Cutover.**

Per the assessment's headline finding: this is a **small one-time cutover** (roughly 120 real rows across all 21 sheets, most sheets under 10 rows), not a bulk-data migration problem. The pipeline below is scoped to that reality — it's built for correctness and auditability, not throughput.

## 7. Excel import design

**Entry point:** an Admin-only screen (`app/(app)/cmp/admin/import/page.tsx`, HOD CSI/Admin role only) — upload the `.xlsx` file, pick which sheet(s) to import (one at a time, so each sheet's staging/validation/commit is independently reviewable rather than one all-or-nothing batch).

**Parsing:** `lib/cmp/excel-import.ts`, using the `exceljs` npm package (new dependency — the assessment's Python analysis used `openpyxl`, which isn't available to the Node.js runtime; `exceljs` is its closest Node equivalent and handles formula-vs-value distinction the same way). For each sheet, parsing follows the exact column mapping already documented per-table in `03_field_and_functional_mapping.md` — the import code is a direct implementation of that table, not a new design.

**Staging, not direct write:** every parsed row becomes one `CMP_IMPORT_BATCH_ROW` with the raw parsed values in `RawData` (JSONB) and `Status = 'Pending'`. The batch (`CMP_IMPORT_BATCH`) records the source file name, sheet, and target table. **Nothing is written to a live CMP table at parse time** — this is the same principle as your explicit instruction ("all Excel imports must use validation, reconciliation and audit logging," "do not simply embed or upload the Excel tracker as the final solution").

**Transformations applied during parsing** (per the assessment's per-sheet findings, not reinvented here):
- Period labels normalized against the fixed `CMP_PERIOD` enum ("Y1 Q1" → `Y1Q1`).
- RAG columns are **dropped**, never imported — recomputed from the underlying data per the assessment's finding that stored RAG in the source is often already inconsistent (e.g. `03_CMP_Master_Checklist`'s Status/RAG mismatch).
- Wide-format sheets (`09_KPI_Scorecard`'s Baseline/Y1/Y2/Y3/Y5 columns, `16_Training_Cert`'s Y1–Y5 columns) are pivoted into the normalized long-format rows the target tables expect (`CMP_KPI_TARGET`, `CMP_TRAINING_MILESTONE`).
- `"TBD"` string values become SQL `NULL`, not the literal string `"TBD"` — the schema's computed fields already handle NULL correctly (returning "TBD" for *display*); storing the string itself would be the same false-precision problem found in the source Excel's `IFERROR(...,"TBD")` pattern.

## 8. Data validation rules

Applied row-by-row during a distinct "Validate" step (not at parse time — keeping parse and validate separate means a parsing bug doesn't silently also mean a validation bug, and validation can be re-run without re-uploading the file). Writes `ValidationErrors` (JSONB, empty array if none) and sets each row's `Status` to `Valid` or `Invalid`.

Validation rules, drawn directly from each table's "Proposed validation rule" already specified in the assessment (deliverable 1) and schema (deliverable 5) — not new rules invented for this document:

| Rule class | Example | Source |
|---|---|---|
| Required fields | Milestone must have Workstream, Title, Owner | Assessment sheet 3 |
| Enum membership | `PlannedPeriodCode` must be one of the 21 canonical `CMP_PERIOD` codes | Assessment sheet 8/11 cross-cutting rule |
| Numeric range | Risk `Impact`/`Likelihood` in 1–5; percentages in 0–1 | Assessment sheet 7; schema CHECK constraints |
| Weight-sum integrity | Scorecard category weights sum to 1.0 across the batch | Assessment sheet 1 |
| Paired-field rules | Decision `DecisionDate` + `Outcome` both present or both absent | Assessment sheet 5 |
| Cross-row uniqueness | Milestone codes unique within the batch and against existing data | Assessment sheet 3 |
| Referential existence | `PillarName` on a service-catalogue row must match a pillar already staged/committed | Assessment sheet 13 |

A row failing any rule is `Invalid` with a human-readable message per violated rule (not just a boolean) — the admin fixes the value directly in the staging UI (editing `RawData`) and re-validates, rather than re-uploading the whole file for one bad cell.

## 9. Data migration plan

Sequence, matching your specified process:

1. **Data profiling** (already done — deliverable 1, the Excel assessment itself, is the profiling output).
2. **Data cleansing** — the 2 known bugs found in the source (scorecard rows 15/17 diverging from S-Curve; the Shadow P&L blank-row false-Green) are corrected at **transformation time**, not imported as-is (already specified in deliverable 1's per-sheet migration treatment).
3. **Field mapping** — already done (deliverable 3).
4. **Staging import** — parse each of the 21 sheets into `CMP_IMPORT_BATCH_ROW` (deliverable 7, above), one batch per sheet, run in dependency order (`CMP_PLAN` and `CMP_PERIOD` first since most other tables FK to them; `CMP_BUSINESS_PILLAR` before `CMP_SERVICE_CATALOGUE_ITEM` and `CMP_BREAKEVEN_VIEW`; `CMP_MILESTONE` before `CMP_ACTION`, since actions can reference a milestone).
5. **Validation** — deliverable 8, above, applied per batch.
6. **Production migration (commit)** — only `Valid` rows commit, each `CMP_IMPORT_BATCH_ROW.TargetRecordId` populated with the new row's UUID, in a single transaction per batch (all-or-nothing per sheet, so a partial failure doesn't leave a batch half-committed). Batch `Status → Committed`.
7. **UAT** — deliverable 14, separate document.
8. **Final cutover** — once UAT signs off, the Excel file is marked (in its own filename/location, outside CSIDOP) as superseded; nobody edits it again. CSIDOP's `CMP_PLAN` becomes the system of record.

**This runs once**, against real production data, only after the full 15-deliverable package is approved and the module has been built and tested in the isolated dev environment already set up (`csidop_cmp_dev`). It is explicitly **not** a recurring sync — see deliverable 6's data-entry model (continuous, owner-driven entry replaces Excel entirely going forward).

## 10. Data reconciliation plan

After each batch commits, a reconciliation report compares source vs. committed state and is shown to the admin for sign-off before the batch is considered done:

- **Row counts**: sheet's real (non-header, non-blank) row count vs. committed row count — must match exactly, or the discrepancy is explained (e.g. a row was correctly rejected and the admin acknowledges it).
- **Aggregate checks**, table-specific:
  - Scorecard: `SUM(Weight)` = 1.0.
  - KPI: `SUM(Weight)` = 1.0.
  - Readiness areas: `SUM(Weight)` = 1.0.
  - Risk register: risk count and category breakdown matches the source sheet's.
  - S-Curve: all 21 periods present, Planned % values match the source exactly (these are fixed plan targets, not subject to interpretation).
- **Spot-check sign-off**: given the small volume (assessment's headline finding), the admin manually compares a handful of individual rows (not a sample-size formula — with ~120 total rows across everything, "look at all of them" is realistic and more trustworthy than a statistical sample) against the live Excel before marking the batch reconciled.
- **Audit trail**: every commit is already captured in `audit_log` (existing infrastructure) plus the `CMP_IMPORT_BATCH` record itself, giving a permanent record of exactly what was imported, by whom, and when — satisfying your "all Excel imports must use validation, reconciliation and audit logging" instruction without new infrastructure.

Reconciliation is a **manual sign-off gate**, not a fully automated pass/fail — appropriate for a one-time, low-volume, high-stakes (Chairman-facing) migration where a human confirming "yes, this matches" is more valuable than a green checkmark from an automated diff.
