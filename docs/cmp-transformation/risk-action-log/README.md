# CMP Risk Register and Action Log: starter entries

Prepared 12 Nov 2026 for the management presentation. The Risk Register and Action Log on the CMP dashboard were empty.

**These are drafts for the HOD to review.** They are written in plain language and kept short: 7 risks and 7 actions. Edit any wording, owner or date in the Issues screen after loading them.

## The entries

**Risks** (type Issue, shown in the Risk Register): staff competency, high workload, reliance on a few key people, unclear priorities between the three subsidiaries, groundwork not ready, unclear ownership and reporting, and customer demand not yet proven. Four are High, three are Medium. The mitigation sits in each entry's recovery action and support-required fields (visible in the Issues screen).

**Actions** (type Decision, shown in the Action Log): one action for each risk, with an owner, who decides, and a due date between 5 Dec 2026 and 28 Feb 2027. The "Task" column shows the action; the question to settle is in the description.

| Source | Entries |
|---|---|
| From what the plan and dashboard show | High workload (peak in H1 2027), unclear priorities (all three subsidiaries start together), groundwork not ready (mandate, pricing and financial case behind plan), unclear ownership and reporting (no owners recorded, 54% of items updated) |
| The HOD's own judgement of typical transformation risk (not taken from data) | Staff competency, reliance on a few key people, customer demand not yet proven |

Nothing is linked to a plan item, so **no item's Red / Amber / Green changes** (an open decision whose due date has passed would turn its linked item Red; these have no link, and all due dates are in the future).

## How to load them

From the repo root on the VM, after `git pull`. Rehearse first, because the dry run changes nothing:

```bash
sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/risk-action-log/LOG_seed_apply.sql
```

Expect `Removed N earlier starter entries and added 14 entries (7 risks, 7 actions).` and `DRY RUN: rolling everything back.` Then run the same line without `-v dry_run=1`.

- **One script covers every starting point.** It removes any earlier starter entries (the first version or the plain-language rewrite) and loads these 14, in one transaction. On an empty log it just loads them (N = 0).
- **Your own entries are never touched.** Only entries whose text exactly matches a starter entry are removed. Anything you added or edited by hand stays.
- A second run is refused. `LOG_seed_revert.sql` removes the starter entries (this set or earlier ones).
- Each run is one transaction, writes an audit entry per row, and aborts if progress updates or evidence would change.

## Dashboard ordering

The dashboard lists risks most serious first (then nearest due date) and actions by nearest due date, closed items last.

Screenshot from a test copy of the dev data: `risk-action-log-test-copy.jpg`.
