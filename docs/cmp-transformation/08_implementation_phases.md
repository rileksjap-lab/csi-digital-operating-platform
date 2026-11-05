# Implementation Phases (deliverable 12)

All phases build and are verified in the isolated dev environment (`csidop-cmp-worktree`, port 3001, `csidop_cmp_dev`) before any production discussion. Nothing in this plan touches production — that remains a separate, explicitly-confirmed decision when the time comes, per your standing instruction.

## Phase 0 — Schema foundation
- Number `04_proposed_schema.sql` into real migrations under `apps/csidop/migrations/` (continuing the existing sequence), split sensibly (e.g. one migration for the core plan/governance tables, one for financial tables, one for the `CSI_WO` extension columns, one for the share-link/import-batch tables) rather than one giant file — matching how existing migrations are already granular per-concern.
- Add the new `cmp_*` tables to `seed/000_app_role.sql`'s grant list.
- Apply to `csidop_cmp_dev` (already isolated), verify against a fresh `csidop` clone that nothing existing breaks.
- **No UI yet.** This phase is purely "does the schema apply cleanly and pass its own constraints."

## Phase 1 — Core governance module
- `CMP_PLAN`, `CMP_SCORECARD_CATEGORY`, `CMP_MILESTONE`, `CMP_RISK`, `CMP_ACTION`, `CMP_DECISION`, `CMP_ISSUE`, `CMP_MEETING_MINUTES`.
- Executive Dashboard shell (scorecard cards, milestone/risk/decision lists) — no S-Curve chart or financials yet.
- Guards from deliverable 11 (`requireCmpRead`, `requireCmpGovernanceEdit`).
- This is the "living tracker" — the part with real content to migrate (14 milestones, 5 risks, a handful of decisions/issues) and the part CSI staff will actually use day-to-day.

## Phase 2 — S-Curve and KPI Scorecard
- `CMP_PERIOD`, `CMP_SCURVE_PERIOD` (including the draft/publish mechanic), `CMP_KPI`/`CMP_KPI_TARGET`/`CMP_KPI_ACTUAL`.
- The weighted-milestone-completion calculation (`lib/cmp/calculations.ts`) — the core mechanic that makes this module more than a copy of the Excel.
- This is the highest-value phase to get right, since it's the one piece of business logic the source Excel documents but never implements.

## Phase 3 — Financial tracking (Finance-gated)
- `CMP_BREAKEVEN_VIEW`, `CMP_SHADOW_PNL_PERIOD`, `CMP_BUSINESS_PILLAR`, `CMP_SERVICE_CATALOGUE_ITEM`.
- `requireCmpFinanceEdit` guard.
- **Sequencing note**: this phase can be *built* independently of Finance's timeline, but can't be *populated* with real numbers until Finance validates the 4 baseline inputs (Annual Operating Cost, Expected Gross Margin %, Future Company Fixed Cost, Future Company Contribution Margin %) — same dependency the Excel itself has today. Build it, ship it with `TBD`/null states rendering correctly, don't block the rest of the module on Finance's timeline.

## Phase 4 — BIM, resourcing, readiness
- `CSI_WO` extension (`CmpPillarId`/`CmpQaQcStatus`/`CmpRevenueAttributed`).
- `CMP_RESOURCE_PLAN_ITEM`, `CMP_TRAINING_TRACK`/`CMP_TRAINING_MILESTONE`, `CMP_READINESS_AREA`.

## Phase 5 — Excel import & one-time cutover
- Import/validation/commit pipeline (deliverables 7–10).
- Run once, against the real Excel, into the real production CMP tables — this is the first phase with a genuine production step, and gets its own explicit confirmation before anything runs there, same as every other production action this session.

## Phase 6 — Public access & presentation
- `CMP_PUBLIC_SHARE_LINK`/`CMP_PUBLIC_SHARE_ACCESS_LOG`, the public route, rate limiting.
- Presentation Mode + PDF export.

## Phase 7 — Automation
- Cross-module KPI auto-derivation (`lib/cmp/kpi-derivation.ts`).
- Review-cadence notifications.
- This phase is explicitly last — it's pure enhancement on top of a module that's already fully functional with manual entry from Phase 1 onward; nothing in Phases 1–6 depends on it.

## Cross-cutting, throughout every phase
- Every phase is built and manually verified in the CMP worktree/port-3001 environment before being considered done.
- Every new table's writes flow through `audit_log` from Phase 0 onward — not retrofitted later.
- No phase modifies an existing CSIDOP table in a breaking way — the only existing-table change in the whole plan is 3 new nullable columns on `CSI_WO` (Phase 4), which cannot affect any existing query that doesn't explicitly select them.
