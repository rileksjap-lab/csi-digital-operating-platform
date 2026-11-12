# CMP Risk Register and Action Log: starter entries

Prepared 12 Nov 2026 for the management presentation. The Risk Register and Action Log on the CMP dashboard were empty.

**These are drafts for the HOD to review, written in plain language rather than figures.** Every entry is drawn from something visible in the plan, the dashboard or the change requests, not from outside business knowledge. Edit any wording, owner or date in the Issues screen after loading them, or change the script before running it.

## What is added

- **11 risks** (type Issue, shown in the Risk Register): 4 High, 6 Medium, 1 Low. Mitigation is held in the entry's recovery action and support-required fields (visible in the Issues screen).
- **9 actions** (type Decision, shown in the Action Log): the "Task" column shows the action; the question to settle is in the description. Each has an owner, a decision owner and a due date between 20 Nov 2026 and 31 Mar 2027. Eight are Open, one is In Progress (applying CR-01 to CR-03).
- Nothing is linked to a plan item, so **no item's Red / Amber / Green changes** (an open decision whose due date has passed would turn its linked item Red; these have no link and all due dates are in the future).

## Where each risk comes from

| Entry | Source |
|---|---|
| Five workstreams behind plan | Management Control slide, 12 Nov 2026 (gaps of 16 to 28 points) |
| Financial & Break-Even about 28 points behind | Same slide; its P&L and budget items are critical gates in the plan |
| Three subsidiaries start together, no launch order | Plan dates: Cloud, BIM and Cybersecurity all run Jan 2027 to Jun 2028 |
| All 11 workstreams active at once in H1 2027 | Count of plan windows per quarter (5, 8, 11, 11, 7, 6, 5, 5, 1) |
| Progress recorded before planned start | Cloud, BIM and Cybersecurity show about 12% actual against 0% plan |
| Only 54% of items have a status | Data Completeness gauge on the dashboard |
| Same dates for every item in a workstream | The baseline as imported; CR-02 addresses it |
| Owner and sponsor titles blank | CR-01 (approved, not yet applied) |
| Governance ends Jun 2027 | Governance, Risk & Decisions window; Year 3 gate is Jun 2029 |
| No scope for Years 4 and 5 | Plan ends Dec 2028; CR-03 addresses it |
| Owners new to CSIDOP progress updates | Early onboarding feedback on the module |

## How to load them

From the repo root on the VM, after `git pull`. Rehearse first, because the dry run changes nothing:

```bash
sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/risk-action-log/LOG_seed_apply.sql
```

Then the real run (drop `-v dry_run=1`). Expect "Added 20 entries (11 risks, 9 actions)". A second run is refused, and `LOG_seed_revert.sql` removes exactly these entries and nothing added by hand. Each run is one transaction, writes an audit entry per row, and aborts if progress updates or evidence would change.

## If the first version is already loaded

The first version used figures in the wording ("about 28 points behind", "54% of items"). `LOG_seed_reword.sql` rewrites those same entries in plain language, in place. Codes, owners, due dates and status stay as they are, and anything you edited by hand in other entries is untouched.

```bash
sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/risk-action-log/LOG_seed_reword.sql
```

Expect `Reworded 20 of 20 entries.` and `DRY RUN: rolling everything back.`, then run it again without `-v dry_run=1`. If you had already edited the wording of one of the starter entries yourself, that entry is skipped (it no longer matches), so the count will be lower than 20. `LOG_seed_apply.sql` now loads the plain-language version directly and refuses to run if either version is already there. `LOG_seed_revert.sql` removes either version.

## Dashboard ordering

The dashboard now lists risks most serious first (then nearest due date) and actions by nearest due date, closed items last. Before, both lists showed newest first, which put the least serious risks at the top.

Screenshot from a test copy of the dev data: `risk-action-log-test-copy.jpg`.
