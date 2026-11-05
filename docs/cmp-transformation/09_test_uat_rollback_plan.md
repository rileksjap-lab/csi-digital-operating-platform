# Test Plan, UAT Plan, Rollback Plan (deliverables 13–15)

## 13. Test plan

**Unit tests** (`lib/cmp/calculations.ts`, `lib/cmp/kpi-derivation.ts`) — the highest-value tests in the whole module, since these functions replace formulas the source Excel got subtly wrong twice (the scorecard drift, the Shadow P&L false-Green):
- RAG computation across the Green/Amber/Red/null-input boundary conditions, including the explicit regression case: all financial inputs null → RAG is `null`/"TBD", never "Green" (the exact bug found in `11_ShadowPnL`).
- Weighted-milestone-completion formula against known inputs (e.g. 14 milestones at known weights/statuses → expected Actual %).
- Break-even division-by-null handling → `null`, not an exception, not the string `"TBD"` stored anywhere.
- Risk score/rating banding at the exact 8/16 boundaries.
- Weight-sum validation (scorecard, KPI, readiness) rejecting a set that doesn't sum to 1.0.

**Integration tests** (API route level, against `csidop_cmp_dev`):
- Each CRUD endpoint against its guard — including the negative case (a `TeamMember` who doesn't own a milestone gets a 403, mirroring the exact test structure already used for the WO task-creation bug fix earlier this session: real session, valid case, invalid case, edge case).
- Import pipeline: stage → validate → commit, including a deliberately invalid row to confirm it's rejected, not silently coerced.
- Publish action: confirm a published `CMP_SCURVE_PERIOD` row's `ActualPct` doesn't change when a milestone completes afterward, and that a *new* draft period does reflect it.

**Manual verification checklist**, per the existing preview-tool-based workflow used throughout this session — every phase gets its dashboard/list/detail views checked in the browser against `csidop_cmp_dev` (port 3001) before being called done, not just type-checked.

## 14. UAT plan

Run in the isolated dev environment first; a second UAT pass happens against production data only after Phase 5's cutover, before the module is announced as live.

| Scenario | Who | Confirms |
|---|---|---|
| Create and complete a milestone; watch the draft S-Curve Actual % move | HOD CSI | Weighted-completion formula matches hand-calculation |
| Publish a quarter, then edit an older milestone | HOD CSI | Published figure doesn't retroactively change |
| Edit break-even inputs | Finance | Break-even/progress recompute correctly; non-Finance roles can't edit these fields |
| View CMP as a non-CSI department staff account | A CMT or other-department user | Cross-department read access works; edit controls are absent |
| Open the public share link from a logged-out browser | Anyone | Executive subset renders; risk mitigation text, decision remarks, and financial line items are absent; no edit UI reachable |
| Revoke and regenerate the share link | HOD CSI/Admin | Old link 404s immediately, new link works |
| Import a real sheet end-to-end | HOD CSI/Admin | Staged rows match the source; a deliberately-broken row is caught by validation, not silently imported; reconciliation counts match |
| BIM-tagged WO | BIM Team Lead | `CmpQaQcStatus`/`CmpRevenueAttributed` editable through the existing WO edit flow, rolls up into the tagged pillar |

UAT sign-off is HOD CSI's call (same authority the Excel/deck already designate for CMP), with Finance signing off specifically on the financial module once their inputs are live.

## 15. Rollback plan

This module is **purely additive** — new tables plus 3 new nullable `CSI_WO` columns — which makes rollback simple by construction, not something requiring a special mechanism:

- **Schema rollback**: a down-migration dropping the `cmp_*` tables and the 3 `CSI_WO` columns. Since no existing table's *existing* columns, constraints, or queries are touched, dropping the new additions cannot break any pre-existing CSIDOP functionality — this is provable from the schema itself (deliverable 5), not just asserted.
- **Application rollback**: revert to the last commit before the CMP module's application code was merged — same as reverting any other feature, no special handling needed since CMP doesn't modify shared code paths (the only shared-code touch is the sidebar nav-visibility list and the `CSI_WO` type/interface gaining 3 optional fields, both trivially revertible).
- **Data rollback (post-cutover only)**: if something is wrong *after* the Phase 5 production cutover, the original Excel file remains untouched and available as the fallback source of truth (nothing about this plan deletes or modifies the source Excel) — worst case, CSI reverts to manual Excel tracking for one review cycle while the issue is fixed, exactly as they operate today.
- **No production step is taken without the explicit, per-action confirmation** already established as the standing rule for this project — the rollback plan is a description of what to do if something needs undoing, not a green light to skip confirmation on the way there.
