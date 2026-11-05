# CMP Module Architecture (deliverable 6)

Builds on the schema (`04_proposed_schema.sql`) and mapping (`03_field_and_functional_mapping.md`). This describes where the module lives in the existing CSIDOP codebase and how it fits CSIDOP's established patterns — no new architectural conventions are introduced.

## Codebase layout

```
apps/csidop/src/
  app/
    (app)/cmp/                    # authenticated, cross-department views
      page.tsx                    # Executive Dashboard (scorecard, S-Curve, KPI, readiness)
      roadmap/page.tsx            # Five-Year Roadmap timeline
      milestones/page.tsx         # Milestone list + detail
      risks/page.tsx              # Risk register
      actions/page.tsx            # Action log
      decisions/page.tsx          # Decision log
      financials/page.tsx         # Break-even / Shadow P&L / Pillar profitability (Finance + CSI only)
      resourcing/page.tsx         # Resource plan + training/cert roadmap
      readiness/page.tsx          # Company readiness gate
      admin/page.tsx              # Share-link management, plan settings (HOD CSI/Admin only)
    cmp/public/[token]/
      page.tsx                    # Unauthenticated Executive-subset view — OUTSIDE the (app) auth group
    api/cmp/
      plan/route.ts
      milestones/route.ts, milestones/[id]/route.ts
      risks/route.ts, risks/[id]/route.ts
      actions/route.ts, decisions/route.ts, issues/route.ts
      scurve/route.ts, scurve/[period]/publish/route.ts   # publish action is its own endpoint, HOD-only
      kpi/route.ts
      financials/breakeven/route.ts, financials/shadow-pnl/route.ts, financials/pillars/route.ts
      resource-plan/route.ts, training/route.ts, readiness/route.ts
      share-link/route.ts         # generate/revoke, HOD CSI/Admin only
      public/[token]/route.ts     # unauthenticated read endpoint backing the public page
      import/route.ts, import/[batchId]/validate/route.ts, import/[batchId]/commit/route.ts
  lib/
    repositories/
      cmp-plan.repo.ts            # CMP_PLAN, CMP_SCORECARD_CATEGORY
      cmp-governance.repo.ts      # CMP_MILESTONE, CMP_ACTION, CMP_DECISION, CMP_ISSUE, CMP_MEETING_MINUTES
      cmp-risk.repo.ts            # CMP_RISK
      cmp-scurve.repo.ts          # CMP_SCURVE_PERIOD (incl. publish logic)
      cmp-kpi.repo.ts             # CMP_KPI, CMP_KPI_TARGET, CMP_KPI_ACTUAL
      cmp-financial.repo.ts       # CMP_BREAKEVEN_VIEW, CMP_SHADOW_PNL_PERIOD, CMP_BUSINESS_PILLAR, CMP_SERVICE_CATALOGUE_ITEM
      cmp-resourcing.repo.ts      # CMP_RESOURCE_PLAN_ITEM, CMP_TRAINING_TRACK, CMP_TRAINING_MILESTONE
      cmp-readiness.repo.ts       # CMP_READINESS_AREA
      cmp-share-link.repo.ts      # CMP_PUBLIC_SHARE_LINK, CMP_PUBLIC_SHARE_ACCESS_LOG
      cmp-import.repo.ts          # CMP_IMPORT_BATCH, CMP_IMPORT_BATCH_ROW
    cmp/
      calculations.ts             # pure functions: computeRag, computeScurveVariance, computeWeightedMilestoneProgress, computeBreakEven, computeRiskRating — see "Computation layer" below
      kpi-derivation.ts           # cross-module KPI auto-derivation queries (Tenders/Capacity/WO)
      excel-import.ts             # xlsx parsing + row-level validation, called by the import API routes
    auth/
      guards.ts                   # extended with requireCmpEdit(), requireCmpFinanceEdit() — see deliverable 11
components/
  cmp/
    scorecard-card.tsx, scurve-chart.tsx, kpi-table.tsx, risk-register-table.tsx,
    milestone-timeline.tsx, readiness-gate.tsx, presentation-mode.tsx, ...
```

This mirrors the existing WO module's shape exactly (`app/(app)/wo/`, `api/wo/`, `lib/repositories/wo.repo.ts`, `components/wo/`) — no new pattern, just a new domain following the same one.

## Why one repo file per sub-domain, not one `cmp.repo.ts`

`wo.repo.ts` works as a single file because WO has one central entity (`CSI_WO`) with satellite tables (tasks, effort logs, evidence) that are all clearly "part of a WO." CMP has ~20 tables across genuinely distinct sub-domains (governance, financials, resourcing, KPIs) that don't share a single parent entity the way WO's satellites share `CSI_WO`. Splitting by sub-domain keeps each file a reasonable size and keeps PRs reviewable — this is a scale decision, not a stylistic one.

## Computation layer — where "computed, not stored" logic actually lives

The assessment (deliverable 1) and schema (deliverable 5) repeatedly establish that RAG status, S-Curve variance, break-even progress, risk rating, and the weighted-milestone-completion formula must be **computed, not stored**. Concretely, this lives in `lib/cmp/calculations.ts` as plain TypeScript functions (not SQL views, not stored generated columns beyond the few cheap ones already in the schema like `RiskScore`) — repo functions fetch raw rows, then the API route or a thin service layer applies `calculations.ts` before returning JSON. Reasons for TypeScript over SQL views:
- Matches the existing "no ORM, business logic in the application layer" convention (Database Design Spec §1.4).
- Keeps the RAG-threshold values (e.g. the 10-percentage-point Amber band) in one place, easily unit-testable, rather than duplicated across several `CREATE VIEW` definitions.
- The weighted-milestone-completion formula needs to aggregate across `CMP_MILESTONE` filtered by period and status — a query plus a reduce, not naturally a single-table view.

## Cross-module KPI auto-derivation

`lib/cmp/kpi-derivation.ts` holds one function per auto-derivable KPI (e.g. `deriveTenderContributionPct()` queries the `tender`/`csi_wo` tables, `deriveResourceUtilisationPct()` queries the existing Capacity module's aggregates, `deriveBimRevenueContribution()` queries `CSI_WO` rows where `CmpPillarId` points at the BIM pillar). These run **at read time** when the Executive Dashboard loads, not as a scheduled batch job — the underlying queries are the same aggregate queries the Tenders/Capacity/WO modules already run for their own dashboards, so no new heavy computation is introduced. Revisit as a scheduled/cached refresh only if dashboard load time becomes a real problem — not a speculative optimisation to build up front.

## Sidebar & navigation

CMP gets its own top-level sidebar entry, visible to **every** authenticated role regardless of department — the one deliberately cross-cutting entry in an otherwise department-scoped sidebar (CLAUDE.md already anticipates this pattern for "Executive Dashboard" as a shared module). Implementation: the existing role-based nav-item visibility check (used for CSI-only vs. CMT-only sidebar sections) gets a third category — "shared" — which CMP joins alongside Tender Pipeline view and Go/No-Go.

## Public share-link route

`app/cmp/public/[token]/page.tsx` sits **outside** the `(app)` route group entirely, so it bypasses the existing auth middleware by construction rather than by a conditional exception inside it — the safer way to build the first unauthenticated route in the app (an allow-list exception inside `middleware.ts` is one misconfigured line away from accidentally exempting something else; a route that's structurally outside the protected group can't leak that way). Its API backing (`api/cmp/public/[token]/route.ts`) calls a **separate, narrower set of repo functions** that select only the Executive-subset columns (never the same functions the authenticated risk/decision-detail pages use) — this is enforced by not sharing query functions between the two, not by a permission check inside a shared function, so there's no code path where a bug could accidentally over-expose a field to the public route.

## Presentation Mode & export

Reuses the existing WO PDF/PPTX report-generation infrastructure (`pdfkit`, already a dependency) rather than building new export tooling. "Presentation Mode" (the one good idea worth keeping from the MVP prototype) becomes a full-screen client-side view of the same Executive Dashboard data, plus a "Download as PDF" action wired to the existing report generator — this directly replaces `18_Slide_Data_Map`'s manual copy-into-PowerPoint workflow.

## Notifications

Reuses the existing notification system. New notification types: `CmpReviewReminder` (fired N days before a plan's next monthly/quarterly review date, to owners with stale or incomplete items) and `CmpDecisionPending` (HOD CSI digest of open decisions awaiting a call). No new notification infrastructure — same delivery mechanism already used for WO/task notifications.
