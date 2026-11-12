-- ══════════════════════════════════════════════════════════════════════════════
-- Risk Register and Action Log: apply the starter entries
-- Plan: CSI-5 Year Transformation Plan (71878149-378d-477a-a916-6cc4ef01b5c8)
-- Source: docs/cmp-transformation/risk-action-log/README.md
--
-- Adds 11 risks (type Issue, shown in the Risk Register) and 9 actions (type Decision, shown in the Action Log) to the CMP issue log.
--
-- Run on the VM from the repo root, as postgres, in the production database, after the HOD has
-- reviewed the entries. Rehearse first with the dry-run switch (everything
-- is rolled back):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/risk-action-log/LOG_seed_apply.sql
-- Real run (drop the dry_run switch):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -f - < docs/cmp-transformation/risk-action-log/LOG_seed_apply.sql
--
-- Safe by design: one transaction; every guard failure aborts and changes nothing; it never
-- touches cmp_item_updates or cmp_evidence (checked by checksum before and after); every
-- change is written to audit_log with its hash-chain link. Run it while nobody is saving
-- in the app so the audit chain stays in order.
-- ══════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.cr_audit(p_entity text, p_id uuid, p_action text, p_field text,
                                 p_old text, p_new text, p_reason text, p_by uuid)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE
  v_prev text;
  v_now  timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_iso  text;
  v_hash text;
BEGIN
  SELECT checksumhash INTO v_prev FROM audit_log ORDER BY id DESC LIMIT 1;
  IF v_prev IS NULL THEN v_prev := encode(sha256(convert_to('GENESIS', 'UTF8')), 'hex'); END IF;
  v_iso := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_hash := encode(sha256(convert_to(concat_ws('|', v_prev, p_entity, p_id::text, p_action,
            coalesce(p_field, ''), coalesce(p_old, ''), coalesce(p_new, ''), coalesce(p_reason, ''),
            p_by::text, v_iso), 'UTF8')), 'hex');
  INSERT INTO audit_log (entityname, entityid, action, fieldname, oldvalue, newvalue, reason,
                         performedby, performedat, checksumhash)
  VALUES (p_entity, p_id, p_action, p_field, p_old, p_new, p_reason, p_by, v_now, v_hash);
END $f$;

-- Checksums of the progress data, to prove this script leaves it untouched.
CREATE TEMP TABLE _cr_guard ON COMMIT DROP AS
SELECT (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.item_id), '')) FROM cmp_item_updates t) AS updates_md5,
       (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) FROM cmp_evidence t) AS evidence_md5;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cmp_plans WHERE id = '71878149-378d-477a-a916-6cc4ef01b5c8') THEN RAISE EXCEPTION 'Plan not found: wrong database?'; END IF;
END $$;

CREATE TEMP TABLE _log (type text, ws text, descr text, sev text, owner text, due date, status text, impact text,
                        support text, decision text, decision_owner text, recovery text) ON COMMIT DROP;
INSERT INTO _log VALUES
  ('Issue', 'Foundation workstreams', 'The groundwork workstreams (New Co, pricing, finance, organisation and governance) are running behind plan, while the subsidiaries are due to start soon and rely on them.', 'High', 'CSI HOD / Management', '2026-12-31'::date, 'Open', 'The subsidiaries could start without an approved mandate, pricing and financial case, so launch effort may be wasted or delayed.', 'Management to prioritise the approvals that the subsidiaries depend on.', NULL, NULL, 'A recovery plan for each Red workstream at the December review, and no subsidiary approved until its groundwork is in place.'),
  ('Issue', 'Financial & Break-Even', 'The financial case for the subsidiaries is not yet signed off, and every subsidiary investment decision depends on it.', 'High', 'Finance Representative', '2026-12-15'::date, 'Open', 'Without a validated break-even view, management cannot responsibly commit investment to any subsidiary.', 'Finance and Management time to review and approve the model.', NULL, NULL, 'Finish and validate the multi-year financial model and budget for each subsidiary before it is approved.'),
  ('Issue', 'Cloud / BIM / Cybersecurity', 'Cloud, BIM and Cybersecurity are all scheduled to start and finish together, with no agreed order of priority.', 'High', 'CSI HOD / Management', '2026-12-15'::date, 'Open', 'One team is stretched across three launches at once, so none of them may be ready to go live on time.', 'Management to confirm the priority and sequence.', NULL, NULL, 'Agree the order, then stagger the subsidiaries through an approved plan change.'),
  ('Issue', 'Cross-workstream', 'Almost every workstream is active at the same time in the first half of 2027, which is more than the team can comfortably carry.', 'High', 'CSI HOD / HR', '2026-12-31'::date, 'Open', 'Delivery capacity and management attention are likely to run out at the peak, and progress updates and evidence will slip.', 'A capacity plan for the busy period, and temporary or external help if needed.', NULL, NULL, 'Review capacity before the peak begins and postpone lower-priority work inside each workstream.'),
  ('Issue', 'Cloud / BIM / Cybersecurity', 'Some subsidiary work is recorded as started even though the plan has not begun and no evidence is attached.', 'Medium', 'CSI HOD', '2026-11-27'::date, 'Open', 'Management may be shown more progress than is really there, which makes it harder to trust the comparison with the plan.', 'Workstream owners to confirm what has really started and attach evidence.', NULL, NULL, 'Check each item with its owner: reset it where no real work has started, or bring the planned start forward where work has genuinely begun.'),
  ('Issue', 'Cross-workstream', 'A large part of the plan has no progress entered yet, so the readiness picture rests on incomplete information.', 'Medium', 'CSI HOD', '2026-12-05'::date, 'Open', 'Some items look Red only because nobody has updated them, which invites argument about the numbers.', 'Workstream owners to update CSIDOP every month.', NULL, NULL, 'A fixed monthly update routine (owners early in the month, HOD review) and follow-up on missing updates.'),
  ('Issue', 'Cross-workstream', 'Every item in a workstream currently shares the same dates, which makes the groundwork workstreams look further behind than they really are.', 'Medium', 'CSI HOD', '2026-11-30'::date, 'Open', 'The numbers get disputed instead of the real issues being discussed.', 'Approval to spread the item dates, which is already prepared.', NULL, NULL, 'Spread the item dates sensibly inside each workstream''s existing window.'),
  ('Issue', 'Cross-workstream', 'No workstream has a named owner or sponsor recorded yet.', 'Medium', 'CSI HOD', '2026-11-20'::date, 'Open', 'It is unclear who answers for a workstream that is behind.', 'None: the owner and sponsor titles are already approved.', NULL, NULL, 'Enter the approved owner and sponsor names in CSIDOP.'),
  ('Issue', 'Governance, Risk & Decisions', 'The governance workstream finishes well before the subsidiaries have launched, although decisions and gates continue much longer.', 'Medium', 'CSI HOD / Management', '2027-03-31'::date, 'Open', 'A governance gap while the subsidiaries are still launching.', 'Management to confirm the review rhythm until the Year 3 gate.', NULL, NULL, 'Keep the monthly and quarterly reviews running to the Year 3 gate, with a standing governance item.'),
  ('Issue', 'Sustain & Expand (Years 4-5)', 'The approved plan stops at the end of 2028, so nothing is planned for the later years.', 'Medium', 'CSI HOD', '2026-12-31'::date, 'Open', 'The progress curve reads as complete from then on, which hides the recurring revenue, renewals and margin work still to be delivered.', 'None: the structure and weight are already approved.', NULL, NULL, 'Add a workstream covering the later years: keeping revenue, renewals and margin healthy and growing.'),
  ('Issue', 'CSIDOP CMP Engine', 'Workstream owners are still getting used to updating progress in CSIDOP.', 'Low', 'CSIDOP Product Owner', '2026-12-15'::date, 'Open', 'Late or missing updates weaken the dashboard the chairman relies on.', 'A short how-to guide and a training slot for each owner.', NULL, NULL, 'A short walkthrough with each workstream owner, and the HOD follows up on missing updates.'),
  ('Decision', 'Cloud / BIM / Cybersecurity', 'In what order should the three subsidiaries launch, and should their start dates be staggered?', 'High', 'CSI HOD', '2026-12-15'::date, 'Open', 'Stops three launches competing for the same team.', NULL, 'Decide which subsidiary launches first: Cloud, BIM or Cybersecurity.', 'Management', NULL),
  ('Decision', 'Cross-workstream', 'Can the team carry all the workstreams together, or which work should be postponed?', 'High', 'CSI HOD / HR', '2026-12-15'::date, 'Open', 'Decides whether the peak period is realistic.', NULL, 'Agree the team''s capacity for the busy first half of 2027.', 'Management', NULL),
  ('Decision', 'Cross-workstream', 'Enter the approved owners and sponsors, the spread-out dates and the later-years workstream in CSIDOP.', 'Medium', 'CSI HOD', '2026-11-20'::date, 'In Progress', 'Gives every workstream an accountable owner, a realistic plan and a view beyond 2028.', NULL, 'Apply the approved plan changes in CSIDOP.', 'CSI HOD', NULL),
  ('Decision', 'Cloud / BIM / Cybersecurity', 'If the work is real, bring the planned start forward. If not, reset the items to Not Started.', 'Medium', 'CSI HOD', '2026-11-27'::date, 'Open', 'Settles why those workstreams show progress before their planned start.', NULL, 'Confirm whether the recorded progress on the three subsidiaries is real work.', 'CSI HOD', NULL),
  ('Decision', 'Foundation workstreams', 'Each Red workstream owner records what is blocking them and what help is needed, before the review.', 'Medium', 'Workstream owners (Red workstreams)', '2026-11-27'::date, 'Open', 'Gives the review the reasons behind each Red, not only the status.', NULL, 'Ask every Red workstream owner to log blockers and the support needed.', 'CSI HOD', NULL),
  ('Decision', 'New Co / Financial & Break-Even', 'Approve the rule that a subsidiary can only be set up as a company once the New Co mandate and the financial case are approved.', 'Medium', 'Transformation Lead', '2026-12-15'::date, 'Open', 'Prevents a subsidiary being approved on unvalidated numbers.', NULL, 'Agree that a subsidiary is approved only after its groundwork is.', 'Management', NULL),
  ('Decision', 'Cross-workstream', 'Confirm who updates, by when each month, and who reviews.', 'Medium', 'CSI HOD', '2026-12-05'::date, 'Open', 'Keeps the dashboard current and credible.', NULL, 'Start a monthly progress update routine.', 'CSI HOD', NULL),
  ('Decision', 'Governance, Risk & Decisions', 'Confirm who meets, how often, and for how long.', 'Medium', 'CSI HOD', '2027-03-31'::date, 'Open', 'Avoids a governance gap while the subsidiaries launch.', NULL, 'Keep governance running until the Year 3 gate.', 'Management', NULL),
  ('Decision', 'Sustain & Expand (Years 4-5)', 'Name an owner for each item in the new workstream and set targets for the measurable ones.', 'Low', 'Transformation Lead', '2027-01-31'::date, 'Open', 'Makes the new workstream measurable from the start.', NULL, 'Name owners and targets for the later-years work.', 'CSI HOD', NULL);

CREATE TEMP TABLE _old (descr text) ON COMMIT DROP;
INSERT INTO _old VALUES
  ('Five of eleven workstreams are behind plan (16 to 28 points at 12 Nov 2026), yet the three subsidiaries start in Jan 2027 and depend on them.'),
  ('Financial & Break-Even is about 28 points behind plan, and its approvals (three-year P&L, budget envelope) gate every subsidiary investment decision.'),
  ('The three subsidiaries are planned to start together in Jan 2027 and finish together in Jun 2028, with no agreed launch order.'),
  ('All 11 workstreams are active at the same time from Jan to Jun 2027 (5 in Q3 2026, 8 in Q4 2026, 11 in H1 2027).'),
  ('Progress (about 12% each) is already recorded on the three subsidiaries before their planned start date, with no evidence attached.'),
  ('Only 54% of items have any progress status entered, so readiness and RAG rest on incomplete data.'),
  ('Every item in a workstream shares one start and finish date, which overstates planned progress for the foundation workstreams.'),
  ('Workstream owner and sponsor titles are blank on all 11 workstreams.'),
  ('The governance workstream ends in Jun 2027, but decisions and gates continue to the Year 3 gate (Jun 2029).'),
  ('The approved plan ends in Dec 2028, so no scope is planned for Years 4 and 5 (to Jun 2031).'),
  ('Workstream owners are new to updating progress in CSIDOP, and early onboarding found friction.'),
  ('Which subsidiary launches first, and should the three windows be staggered?'),
  ('Can all 11 workstreams run together in H1 2027, or which items are deferred?'),
  ('Run the tested scripts, dry run first: owners and sponsors, staggered dates, Years 4-5 workstream.'),
  ('Real work: move the planned start earlier. Not real: reset the items to Not Started.'),
  ('Each Red workstream owner records the blocker and the support needed in CSIDOP.'),
  ('Approve the rule that a subsidiary''s incorporation decision needs both approvals first.'),
  ('Confirm the cadence: owners update by day 5 of each month, HOD reviews, quarter-end snapshot taken.'),
  ('Confirm who meets, how often, and until when.'),
  ('Name the owner of each of the 16 items and set targets for the five KPI items.');

DO $$
DECLARE v_plan uuid := '71878149-378d-477a-a916-6cc4ef01b5c8'; v_hod uuid; r record; v_next int; v_id uuid; n int := 0;
BEGIN
  SELECT locked_by INTO v_hod FROM cmp_plans WHERE id = v_plan;
  IF v_hod IS NULL THEN RAISE EXCEPTION 'The plan has no locked_by staff id to attribute the entries to'; END IF;
  IF EXISTS (SELECT 1 FROM cmp_issue_log l WHERE l.plan_id = v_plan AND (l.description IN (SELECT descr FROM _log) OR l.description IN (SELECT descr FROM _old))) THEN
    RAISE EXCEPTION 'Some of these entries already exist in the log; refusing to add them twice';
  END IF;
  SELECT coalesce(max(substring(log_code from 4)::int), 0) INTO v_next FROM cmp_issue_log WHERE log_code ~ '^LOG[0-9]+$';
  FOR r IN SELECT * FROM _log ORDER BY (type = 'Decision'), ctid LOOP
    v_next := v_next + 1;
    INSERT INTO cmp_issue_log (plan_id, log_code, type, related_item_id, workstream_label, description, severity, owner_role_title,
                               due_date, status, impact, support_required, decision_required, decision_owner_role_title,
                               recovery_action, created_by)
    VALUES (v_plan, 'LOG' || lpad(v_next::text, 3, '0'), r.type, NULL, r.ws, r.descr, r.sev, r.owner, r.due, r.status, r.impact,
            r.support, r.decision, r.decision_owner, r.recovery, v_hod)
    RETURNING id INTO v_id;
    PERFORM pg_temp.cr_audit('cmp_issue_log', v_id, 'Insert', NULL, NULL, 'LOG' || lpad(v_next::text, 3, '0') || ' ' || r.type || ': ' || left(r.descr, 120),
            'Starter entries for the management presentation; applied by script', v_hod);
    n := n + 1;
  END LOOP;
  IF n <> 20 THEN RAISE EXCEPTION 'Expected to add 20 entries, added %', n; END IF;
  RAISE NOTICE 'Added % entries (11 risks, 9 actions).', n;
END $$;

DO $$
DECLARE g _cr_guard%ROWTYPE; n_upd text; n_evi text;
BEGIN
  SELECT * INTO g FROM _cr_guard;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.item_id), '')) INTO n_upd FROM cmp_item_updates t;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t.id), '')) INTO n_evi FROM cmp_evidence t;
  IF n_upd IS DISTINCT FROM g.updates_md5 OR n_evi IS DISTINCT FROM g.evidence_md5 THEN
    RAISE EXCEPTION 'Aborted: progress data (updates or evidence) changed, which this script must never do';
  END IF;
  RAISE NOTICE 'Progress updates and evidence unchanged (checksums match).';
END $$;

\if :{?dry_run}
  \echo 'DRY RUN: rolling everything back.'
  ROLLBACK;
\else
  COMMIT;
  \echo 'Committed.'
\endif
