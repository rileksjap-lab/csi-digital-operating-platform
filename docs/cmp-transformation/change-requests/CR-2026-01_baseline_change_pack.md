# CMP baseline change pack: CR-2026-01

**Plan:** CSI-5 Year Transformation Plan (`71878149-378d-477a-a916-6cc4ef01b5c8`), baseline Approved / Locked 11 Nov 2026
**Status: DECIDED by the HOD on 11 Nov 2026 (all recommendations accepted). SQL written and tested on a copy. NOT yet applied to any real database.**
**Needs:** the HOD to run the scripts in `sql/` on the VM when ready (see "How to apply" at the end).

None of these changes touch an item status, score, evidence record or forecast date. They change plan data only: who owns a workstream, when items are planned, and what the plan contains for Years 4–5.

## At a glance

| CR | What changes | Rows touched | Effect on headline numbers | Decision needed |
|---|---|---|---|---|
| CR-01 | Workstream owner and sponsor titles | 11 workstreams | None | **Approved** |
| CR-02 | Staggered start and target dates per item | 198 items | **Planned-today falls from about 16.5% to about 10.7%** (see below) | **Approved**, option A: change the baseline, 31 Dec 2026 date floor |
| CR-03 | New workstream WS12 for Years 4–5, other 11 weights rescaled | 1 new workstream, 8 factors, 16 items, 11 weight edits | Readiness and planned both scale by 0.90 until WS12 items start | **Approved**: 10% weight, structure as below |

## CR-01: workstream owner and sponsor

I read each line as *owner / sponsor(s)*: the first role is the owner, everything after it is the sponsor.

| WS | Workstream | ownerRoleTitle | sponsorRoleTitle |
|---|---|---|---|
| WS01 | New Co Establishment | Transformation Lead | Management |
| WS02 | Cloud Subsidiary | Cloud Lead | Management / Commercial |
| WS03 | BIM Subsidiary | BIM Lead | Management / Project Governance |
| WS04 | Cybersecurity Subsidiary | Cybersecurity Lead | Management / Security Sponsor |
| WS05 | Healthcare Technology & Digital Health | Healthcare Lead | Management / Healthcare Sponsor |
| WS06 | Core Commercial Practices | Practice Leads | Management |
| WS07 | Commercial & Revenue Architecture | Commercial Lead | Management |
| WS08 | Financial & Break-Even | Finance Representative | Finance Management |
| WS09 | Organisation & Capability | CSI HOD / HR | Management |
| WS10 | CSIDOP CMP Engine | Product Owner / Tech Lead | CSI HOD |
| WS11 | Governance, Risk & Decisions | CSI HOD / Management | Management |

**How the values were chosen.** WS01–05 and WS08 are from the deck. For WS06, WS07, WS09 and WS11 the HOD said to reuse the roles the items already carry as the owner, so the owner is the existing item role. The sponsor "Management" for those four is my suggestion, which the HOD accepted by taking the recommendations; it can be edited in the app at any time. WS10 follows my reading of the deck line: Product Owner and Tech Lead own it, CSI HOD sponsors it. WS08 and WS10 keep their deck values.

Today these fields are empty on all 11 workstreams. Item-level owners already exist (for example "New Co Lead" on WS01) and are not changed by this pack.

## CR-02: staggered item dates

**Today:** all 18 items in a workstream share one start date and one target date, so the baseline treats them as if they all progress together from day one.

**Rules used**

1. Each workstream keeps its current window. No workstream starts earlier or finishes later than it does today, so nothing moves past the current Dec 2028 end.
2. Inside the window, each of the 18 items gets its own start and target, following the order the work has to happen in: Foundation (mandate, scope, lead, legal assessment), then Design (catalogue, pricing, P&L, budget, capability plan), then Build (pipeline, anchor customer, SOP, platform, contract decision), then Activate (operating model, reporting cadence).
3. The last item in every workstream finishes exactly on the workstream's current end date.
4. **No target date falls before 31 Dec 2026.** The baseline was approved on 11 Nov 2026, so it cannot plan work to finish in the past. Without this rule 14 items would already be overdue on day one.
5. All dates are month starts and month ends.

**Example, WS01 (window Jul 2026 to Jun 2027)**

| Item | Name | Phase | Start | Target |
|---|---|---|---|---|
| IT001 | Business case / mandate approved | Foundation | 2026-07 | 2026-12 (floor) |
| IT002 | Scope and success criteria defined | Foundation | 2026-08 | 2026-12 (floor) |
| IT003 | Service catalogue defined | Design | 2026-09 | 2026-12 |
| IT004 | Pricing and revenue model approved | Design | 2026-11 | 2027-01 |
| IT005 | Qualified pipeline established | Build | 2027-01 | 2027-05 |
| IT009 | Business / practice lead appointed | Foundation | 2026-08 | 2026-12 (floor) |
| IT015 | Legal / compliance requirements assessed | Foundation | 2026-08 | 2026-12 (floor) |
| IT017 | Operating model activated | Activate | 2027-03 | 2027-06 |
| IT018 | Management reporting cadence operational | Activate | 2027-05 | 2027-06 |

All 198 items: [CR-02_proposed_item_dates.csv](CR-02_proposed_item_dates.csv) (current and proposed dates side by side, open it in Excel).

**What it does to the numbers. Please read this before approving.**

The current baseline is front-loaded: every item in a workstream starts on day one, so the plan expects a lot of progress early. Staggering is more realistic, but it lowers the "planned" figure for today:

| | Planned today | Actual (HOD's figure on 11 Nov) | Gap |
|---|---|---|---|
| Current dates | 16.7% | 14.15% | about −2.5 points (behind) |
| CR-02 dates | about 10.8% | 14.15% | about **+3.3 points (ahead)** |

The dashboard headline would change from "behind schedule" to "ahead of schedule" without any work being done. That is a real consequence of moving the baseline, and anyone reading the S-Curve before and after will see it. I recommend recording the reason in the approval ("original dates assumed all items in a workstream run in parallel") so the change cannot be read as a way to improve the picture. If you would rather not change the picture, the alternative is to keep the current dates and add the staggering only as a forecast (forecast dates per item), which leaves the baseline untouched.

With CR-03 applied as well, everything is scaled by 0.90: planned today about 9.8%, actual about 12.7% (14.15% × 0.9), so the gap is about **+2.9 points (ahead)**.

**Item-level colours also change.** On the dev data copy, the count of Red / Amber / Green items goes from 80 / 45 / 73 before the change requests to 38 / 11 / 165 after them, because items that are not due yet stop being flagged as behind. The fewer Reds are the same effect, not an improvement in the work.

Planned and actual figures for the "CR-02 only" row were computed outside the application on the dev data copy, so allow ±0.2 points. The combined figures (9.8% planned, 6.0% actual on the copy's own data) and the Red / Amber / Green counts come from the application itself, running on the copy after the scripts.

## CR-03: Years 4–5 "Sustain & Expand" (new workstream WS12)

**Why:** the plan ends Dec 2028 (Y3 Q2), so the S-Curve is flat at 100% from there to the end of the axis (Y5 Q4, Q2 2031) and the Year 3 gate is the plan's end.

**Structure:** one new workstream, one hidden initiative at 100% (same as every other workstream), 8 factors, 2 items per factor, dated Jul 2029 to Jun 2031. All sibling weights sum to 100% at every level.

| Factor | Weight | Item | Method | Gate | Start | Target |
|---|---|---|---|---|---|---|
| Recurring revenue | 20% | Recurring-revenue share of total revenue reaches target | KPI | no | 2029-07 | 2031-06 |
| | | Managed-service / subscription run-rate in place | Stage | no | 2029-07 | 2030-06 |
| Renewals and retention | 15% | Contract renewal rate meets target | KPI | no | 2029-10 | 2031-06 |
| | | Renewal and retention review cycle operating | Stage | no | 2029-07 | 2030-03 |
| Margin | 15% | Gross margin meets target in each subsidiary | KPI | no | 2029-10 | 2031-06 |
| | | Cost-to-serve review and pricing refresh completed | Stage | no | 2029-07 | 2030-06 |
| Cross-sell | 10% | Cross-sell playbook live across subsidiaries | Stage | no | 2029-07 | 2030-03 |
| | | Cross-sell revenue meets target | KPI | no | 2030-01 | 2031-06 |
| Market expansion | 15% | New market / segment entry decision approved | Approval | yes | 2029-10 | 2030-09 |
| | | New-market pipeline meets target | KPI | no | 2030-07 | 2031-06 |
| Intellectual property | 10% | IP inventory and protection plan approved | Approval | no | 2029-07 | 2030-03 |
| | | Reusable IP productised and registered | Stage | no | 2030-01 | 2031-03 |
| Subsidiary decisions | 10% | Year 4 review of each subsidiary: continue, scale or merge | Approval | yes | 2030-04 | 2030-09 |
| | | Decision on any further subsidiary approved | Approval | yes | 2030-07 | 2031-03 |
| Next growth plan | 5% | Next growth plan drafted | Stage | no | 2030-07 | 2031-03 |
| | | Next growth plan approved | Approval | yes | 2031-01 | 2031-06 |

Each factor's two items are weighted 50/50. Full list: [CR-03_proposed_ws12_items.csv](CR-03_proposed_ws12_items.csv).

**Weights.** WS12 takes 10% of the plan. Every existing workstream weight is multiplied by 0.90, which keeps the total at exactly 100%:

| WS | Now | Proposed |
|---|---|---|
| WS01 | 12.0% | 10.8% |
| WS02 | 10.0% | 9.0% |
| WS03 | 10.0% | 9.0% |
| WS04 | 12.0% | 10.8% |
| WS05 | 10.0% | 9.0% |
| WS06 | 10.0% | 9.0% |
| WS07 | 10.0% | 9.0% |
| WS08 | 8.0% | 7.2% |
| WS09 | 8.0% | 7.2% |
| WS10 | 6.0% | 5.4% |
| WS11 | 4.0% | 3.6% |
| **WS12 (new)** | – | **10.0%** |

**What it does to the numbers.** Until the WS12 items start (Jul 2029), they score 0 against a 10% weight. So every readiness and planned figure on the dashboard is multiplied by 0.90: the HOD's 14.15% becomes about 12.7%, and the Y3 gate baseline reads 90% instead of 100%. The gap in points shrinks by 10% too. If 10% is more than you want, 5% works the same way (existing weights ×0.95) and dilutes less.

**Not decided here:** which owner role each WS12 item carries (the existing items carry roles such as "Cloud Lead"), the KPI targets for the five KPI items (the owner sets them in the progress update after approval), and WS12's own owner and sponsor.

## The baseline curve under each choice

Baseline % at the end of each quarter (the grey line on the S-Curve). Computed outside the application from item weights and dates; allow ±0.2 points.

| Quarter | Ends | Current baseline | CR-02 only | CR-02 and CR-03 |
|---|---|---|---|---|
| Y1Q1 | 30 Sep 2026 | 10.1% | 4.2% | 3.8% |
| Y1Q2 | 31 Dec 2026 | 24.3% | 23.4% | 21.0% |
| Y1Q3 | 31 Mar 2027 | 43.4% | 44.9% | 40.4% |
| Y1Q4 | 30 Jun 2027 | 62.8% | 62.4% | 56.2% |
| Y2Q1 | 30 Sep 2027 | 73.8% | 77.1% | 69.4% |
| Y2Q2 | 31 Dec 2027 | 83.2% | 88.3% | 79.5% |
| Y2Q3 | 31 Mar 2028 | 90.5% | 94.4% | 85.0% |
| Y2Q4 | 30 Jun 2028 | 97.8% | 98.8% | 88.9% |
| Y3Q1 | 30 Sep 2028 | 98.9% | 99.4% | 89.5% |
| Y3Q2 | 31 Dec 2028 | 100.0% | 100.0% | 90.0% |
| Y3Q3 | 31 Mar 2029 | 100.0% | 100.0% | 90.0% |
| **Y3Q4 (Year 3 gate)** | 30 Jun 2029 | 100.0% | 100.0% | 90.0% |
| Y4Q1 | 30 Sep 2029 | 100.0% | 100.0% | 91.1% |
| Y4Q2 | 31 Dec 2029 | 100.0% | 100.0% | 92.7% |
| Y4Q3 | 31 Mar 2030 | 100.0% | 100.0% | 94.4% |
| Y4Q4 | 30 Jun 2030 | 100.0% | 100.0% | 95.8% |
| Y5Q1 | 30 Sep 2030 | 100.0% | 100.0% | 97.2% |
| Y5Q2 | 31 Dec 2030 | 100.0% | 100.0% | 98.2% |
| Y5Q3 | 31 Mar 2031 | 100.0% | 100.0% | 99.3% |
| Y5Q4 | 30 Jun 2031 | 100.0% | 100.0% | 100.0% |

## Decisions (HOD, 11 Nov 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Owner and sponsor for WS06, WS07, WS09, WS11 | Reuse the existing item roles as owner; sponsor "Management" (see CR-01) |
| 2 | WS10 reading | Owner "Product Owner / Tech Lead", sponsor "CSI HOD" |
| 3 | CR-02 approach | Option A: change the baseline, inside existing windows, 31 Dec 2026 floor. Reason to record: "original dates assumed every item in a workstream ran in parallel" |
| 4 | WS12 weight and owner | 10%; owner "Transformation Lead", sponsor "Management" (same as WS01); item owner "Workstream owner (to be confirmed)" until real roles are assigned |
| 5 | How to record | Audit log only (one entry per changed field, citing CR-2026-01) |

## How to apply (nothing has been run on a real database)

The scripts are in [`sql/`](sql/). Each one is a single transaction and has a matching revert.

| Order | Apply | Revert | What it does |
|---|---|---|---|
| 1 | `CR-01_apply.sql` | `CR-01_revert.sql` | 22 field changes on the 11 workstreams |
| 2 | `CR-02_apply.sql` | `CR-02_revert.sql` | New dates on 198 items |
| 3 | `CR-03_apply.sql` | `CR-03_revert.sql` | WS12 added (1 initiative, 8 factors, 16 items); 11 weights ×0.90 |

**Do this first:** merge the S-Curve PR, run migration 057 and restart the app, so you can see the before and after on the real dashboard. Take a snapshot just before CR-02, so the Actual line starts from an unchanged baseline.

**Rehearse each script first.** The dry-run switch does everything and then rolls it all back:

```bash
sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/change-requests/sql/CR-01_apply.sql
```

Run it from the repo root on the VM. Then run the same line without `-v dry_run=1` to apply for real. Run them while nobody is saving in the app, so the audit log stays in order. A dry run still has to read the real plan, so it also proves the guards pass on production data.

**What the scripts protect against (all tested)**
- A guard failure aborts and changes nothing: wrong database, plan not Locked or Approved, a value that was edited since the proposal (an owner, a date, a weight), WS12 already present, item codes IT199 to IT214 already in use.
- Running a script twice is refused.
- They never touch progress updates or evidence. Each script compares a checksum of both tables before and after and aborts if it differs.
- Every changed field is written to `audit_log` with its hash link. I recomputed all 1,186 entries from a full test run the way the app does, with 0 mismatches, so the app can keep appending after them. The audit entries are attributed to the HOD who locked the baseline (`cmp_plans.locked_by`), with the reason "approved by HOD; applied by script".
- Reverts: CR-01 and CR-02 restore the previous values exactly (tested: the data matched the starting state afterwards). CR-03's revert refuses if anyone has already recorded progress, evidence or an issue on a WS12 item, so it can never delete real data.

**After applying**
- Open the dashboard: 12 workstreams, Year 3 gate at 90%, Y5 Q4 at 100%.
- KPI targets for the five WS12 KPI items are set by their owner in the next progress update; owner roles for WS12 items are still "to be confirmed".
- Screenshot of the result on the test copy: `../scurve/after-all-three-crs-scratch-copy.jpg`.

## Test record (scratch copy of the dev CMP data, no real database)

- Dry runs: rolled back, data identical to before.
- Apply, apply again (CR-01, CR-02 and CR-03 all refused the second run), tamper with a weight (CR-03 refused), revert, re-apply: all as expected.
- Revert with progress recorded on a WS12 item: refused.
- Revert CR-02 and CR-01 after applying: data identical to the starting state (checksum).
- After all three: 12 workstreams, 96 factors, 214 items, workstream weights total exactly 1.0000; readiness scaled by exactly 0.90; baseline 90.0% at the Year 3 gate and 100.0% at Y5 Q4.
