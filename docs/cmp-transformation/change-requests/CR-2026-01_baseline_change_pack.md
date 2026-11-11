# CMP baseline change pack: CR-2026-01

**Plan:** CSI-5 Year Transformation Plan (`71878149-378d-477a-a916-6cc4ef01b5c8`), baseline Approved / Locked 11 Nov 2026
**Status: PROPOSED. Nothing in this pack has been applied to any database.**
**Needs:** HOD decision on each change request below, and answers to the open questions at the end.

None of these changes touch an item status, score, evidence record or forecast date. They change plan data only: who owns a workstream, when items are planned, and what the plan contains for Years 4–5.

## At a glance

| CR | What changes | Rows touched | Effect on headline numbers | Decision needed |
|---|---|---|---|---|
| CR-01 | Workstream owner and sponsor titles | 11 workstreams (7 filled in, 4 waiting for you) | None | Approve the 7; answer the 4 |
| CR-02 | Staggered start and target dates per item | 198 items | **Planned-today falls from about 16.5% to about 10.7%** (see below) | Approve the method and the date floor |
| CR-03 | New workstream WS12 for Years 4–5, other 11 weights rescaled | 1 new workstream, 8 factors, 16 items, 11 weight edits | Readiness and planned both scale by 0.90 until WS12 items start | Approve the structure and the weight |

## CR-01: workstream owner and sponsor

I read each line as *owner / sponsor(s)*: the first role is the owner, everything after it is the sponsor.

| WS | Workstream | ownerRoleTitle | sponsorRoleTitle |
|---|---|---|---|
| WS01 | New Co Establishment | Transformation Lead | Management |
| WS02 | Cloud Subsidiary | Cloud Lead | Management / Commercial |
| WS03 | BIM Subsidiary | BIM Lead | Management / Project Governance |
| WS04 | Cybersecurity Subsidiary | Cybersecurity Lead | Management / Security Sponsor |
| WS05 | Healthcare Technology & Digital Health | Healthcare Lead | Management / Healthcare Sponsor |
| WS06 | Core Commercial Practices | *not in the deck, please tell me* | *please tell me* |
| WS07 | Commercial & Revenue Architecture | *please tell me* | *please tell me* |
| WS08 | Financial & Break-Even | Finance Representative | Finance Management |
| WS09 | Organisation & Capability | *please tell me* | *please tell me* |
| WS10 | CSIDOP CMP Engine | Product Owner / Tech Lead | CSI HOD |
| WS11 | Governance, Risk & Decisions | *please tell me* | *please tell me* |

**WS10 needs your confirmation.** Your line was "Product Owner / Tech Lead / CSI HOD". I read Product Owner and Tech Lead as the delivery owners and CSI HOD as the sponsor. The other reading is owner "Product Owner" and sponsor "Tech Lead / CSI HOD".

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

Figures for the CR-02 row were computed outside the application on the dev data copy, so allow ±0.2 points.

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

## How these would be applied, once you approve

- **Data only, no deploy.** Each CR becomes one SQL script, run on the VM as `postgres` inside a single transaction (same sequence as the migrations), with an audit-log entry per change citing the CR number. I will write the scripts only after you approve, and test them on a copy first.
- **Record-keeping gap.** The existing `cmp_change_requests` table records one field change per row against an existing record, so it cannot describe adding WS12. Choices: (A) record each CR in the audit log with this pack attached, or (B) also insert field-level rows for CR-01 (14 rows) and CR-02 (396 rows). I recommend A.
- **Order.** The S-Curve change (this PR) goes first, so the before and after curves can be compared on the real dashboard.

## Open questions

1. **CR-01:** owner and sponsor for WS06, WS07, WS09 and WS11.
2. **CR-01:** is my reading of WS10 right (owner "Product Owner / Tech Lead", sponsor "CSI HOD")?
3. **CR-02:** do you approve staggering inside the existing windows, with the 31 Dec 2026 floor? Or would you prefer to keep the baseline and add the staggering as forecast dates only?
4. **CR-02:** are you comfortable that the headline flips from behind to ahead, and with the reason wording suggested above?
5. **CR-03:** is 10% the right weight for Years 4–5 (or 5%)? Are the eight factors and their weights right?
6. **CR-03:** owner role for WS12 items, and WS12's owner and sponsor.
7. **Records:** audit log only (A), or field-level change-request rows too (B)?
