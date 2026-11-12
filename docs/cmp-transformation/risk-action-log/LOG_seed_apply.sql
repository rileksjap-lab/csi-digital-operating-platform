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
  ('Issue', 'Foundation workstreams', 'Five of eleven workstreams are behind plan (16 to 28 points at 12 Nov 2026), yet the three subsidiaries start in Jan 2027 and depend on them.', 'High', 'CSI HOD / Management', '2026-12-31'::date, 'Open', 'Subsidiary business cases, pricing and break-even assumptions may not be ready when launch work begins, which would push the Year 3 gate.', 'Management to prioritise the New Co mandate, pricing and break-even approvals.', NULL, NULL, 'Recovery plan for each Red workstream at the December review; hold subsidiary incorporation decisions until the foundations are approved.'),
  ('Issue', 'Financial & Break-Even', 'Financial & Break-Even is about 28 points behind plan, and its approvals (three-year P&L, budget envelope) gate every subsidiary investment decision.', 'High', 'Finance Representative', '2026-12-15'::date, 'Open', 'No subsidiary can be approved without a validated break-even model.', 'Finance and Management time to review and approve the model.', NULL, NULL, 'Complete and validate the three-year P&L and budget envelope for each subsidiary before its incorporation decision.'),
  ('Issue', 'Cloud / BIM / Cybersecurity', 'The three subsidiaries are planned to start together in Jan 2027 and finish together in Jun 2028, with no agreed launch order.', 'High', 'CSI HOD / Management', '2026-12-15'::date, 'Open', 'The same CSI and commercial team is stretched across three launches, so none may reach go-live standard on time.', 'Management to confirm priority and sequence.', NULL, NULL, 'Stagger the subsidiaries through an approved baseline change request once the order is set.'),
  ('Issue', 'Cross-workstream', 'All 11 workstreams are active at the same time from Jan to Jun 2027 (5 in Q3 2026, 8 in Q4 2026, 11 in H1 2027).', 'High', 'CSI HOD / HR', '2026-12-31'::date, 'Open', 'Delivery capacity and management attention may not sustain the peak; progress updates and evidence slip.', 'A capacity plan for H1 2027, and temporary or external resources if needed.', NULL, NULL, 'Capacity review before 1 Jan 2027; defer lower-priority items inside each window.'),
  ('Issue', 'Cloud / BIM / Cybersecurity', 'Progress (about 12% each) is already recorded on the three subsidiaries before their planned start date, with no evidence attached.', 'Medium', 'CSI HOD', '2026-11-27'::date, 'Open', 'Readiness shown to management may be overstated, and the plan-versus-actual comparison loses credibility.', 'Workstream owners to confirm what has really started and attach evidence.', NULL, NULL, 'Validate each item. Where there is no real work, reset to Not Started; where work has begun, move the planned start date earlier through a change request.'),
  ('Issue', 'Cross-workstream', 'Only 54% of items have any progress status entered, so readiness and RAG rest on incomplete data.', 'Medium', 'CSI HOD', '2026-12-05'::date, 'Open', 'Some items show Red only because nothing has been entered, which invites argument about the numbers.', 'Workstream owners to update CSIDOP every month.', NULL, NULL, 'Monthly update cadence (owners by day 5, HOD review); chase missing updates.'),
  ('Issue', 'Cross-workstream', 'Every item in a workstream shares one start and finish date, which overstates planned progress for the foundation workstreams.', 'Medium', 'CSI HOD', '2026-11-30'::date, 'Open', 'Workstreams look further behind plan than they are, and the numbers get disputed.', 'Approval and application of the staggered baseline (CR-02).', NULL, NULL, 'Apply CR-02: stagger item dates inside each workstream''s existing window, with no date before 31 Dec 2026.'),
  ('Issue', 'Cross-workstream', 'Workstream owner and sponsor titles are blank on all 11 workstreams.', 'Medium', 'CSI HOD', '2026-11-20'::date, 'Open', 'It is unclear who answers for each Red workstream.', 'None: the titles are already approved.', NULL, NULL, 'Apply CR-01 (owner and sponsor titles) to production.'),
  ('Issue', 'Governance, Risk & Decisions', 'The governance workstream ends in Jun 2027, but decisions and gates continue to the Year 3 gate (Jun 2029).', 'Medium', 'CSI HOD / Management', '2027-03-31'::date, 'Open', 'A governance gap while the subsidiaries are still launching.', 'Management to confirm the review cadence to the Year 3 gate.', NULL, NULL, 'Extend the monthly and quarterly review cadence to the Year 3 gate and add a recurring governance item.'),
  ('Issue', 'Sustain & Expand (Years 4-5)', 'The approved plan ends in Dec 2028, so no scope is planned for Years 4 and 5 (to Jun 2031).', 'Medium', 'CSI HOD', '2026-12-31'::date, 'Open', 'The S-Curve shows 100% from Dec 2028 and hides recurring revenue, renewals and margin work.', 'None: the structure and weight are already approved.', NULL, NULL, 'Apply CR-03: add the Sustain & Expand workstream (16 items, Jul 2029 to Jun 2031).'),
  ('Issue', 'CSIDOP CMP Engine', 'Workstream owners are new to updating progress in CSIDOP, and early onboarding found friction.', 'Low', 'CSIDOP Product Owner', '2026-12-15'::date, 'Open', 'Late or missing updates weaken the dashboard the chairman relies on.', 'A short how-to guide and a training slot for each owner.', NULL, NULL, 'A 30-minute walkthrough per workstream owner; HOD follows up on missing updates.'),
  ('Decision', 'Cloud / BIM / Cybersecurity', 'Which subsidiary launches first, and should the three windows be staggered?', 'High', 'CSI HOD', '2026-12-15'::date, 'Open', 'Removes the capacity clash of three simultaneous launches.', NULL, 'Set the launch order for the Cloud, BIM and Cybersecurity subsidiaries.', 'Management', NULL),
  ('Decision', 'Cross-workstream', 'Can all 11 workstreams run together in H1 2027, or which items are deferred?', 'High', 'CSI HOD / HR', '2026-12-15'::date, 'Open', 'Decides whether the H1 2027 peak is deliverable.', NULL, 'Approve the capacity plan for Jan to Jun 2027.', 'Management', NULL),
  ('Decision', 'Cross-workstream', 'Run the tested scripts, dry run first: owners and sponsors, staggered dates, Years 4-5 workstream.', 'Medium', 'CSI HOD', '2026-11-20'::date, 'In Progress', 'Gives every workstream an accountable owner, a realistic baseline and a plan beyond Dec 2028.', NULL, 'Apply the approved baseline change requests CR-01 to CR-03 to production.', 'CSI HOD', NULL),
  ('Decision', 'Cloud / BIM / Cybersecurity', 'Real work: move the planned start earlier. Not real: reset the items to Not Started.', 'Medium', 'CSI HOD', '2026-11-27'::date, 'Open', 'Settles the 0% plan versus 12% actual question on the slide.', NULL, 'Confirm whether the recorded ''Started'' progress on Cloud, BIM and Cybersecurity is real.', 'CSI HOD', NULL),
  ('Decision', 'Foundation workstreams', 'Each Red workstream owner records the blocker and the support needed in CSIDOP.', 'Medium', 'Workstream owners (Red workstreams)', '2026-11-27'::date, 'Open', 'Gives the review the reasons behind each Red, not only the numbers.', NULL, 'Log blockers and support needed for every Red workstream before the review.', 'CSI HOD', NULL),
  ('Decision', 'New Co / Financial & Break-Even', 'Approve the rule that a subsidiary''s incorporation decision needs both approvals first.', 'Medium', 'Transformation Lead', '2026-12-15'::date, 'Open', 'Prevents a subsidiary being approved on unvalidated numbers.', NULL, 'Agree the gate: subsidiary incorporation decisions wait for the New Co mandate and the break-even model.', 'Management', NULL),
  ('Decision', 'Cross-workstream', 'Confirm the cadence: owners update by day 5 of each month, HOD reviews, quarter-end snapshot taken.', 'Medium', 'CSI HOD', '2026-12-05'::date, 'Open', 'Keeps the dashboard and S-Curve current and credible.', NULL, 'Start the monthly CMP progress update.', 'CSI HOD', NULL),
  ('Decision', 'Governance, Risk & Decisions', 'Confirm who meets, how often, and until when.', 'Medium', 'CSI HOD', '2027-03-31'::date, 'Open', 'Avoids a governance gap while the subsidiaries launch.', NULL, 'Extend the governance cadence beyond Jun 2027 to the Year 3 gate.', 'Management', NULL),
  ('Decision', 'Sustain & Expand (Years 4-5)', 'Name the owner of each of the 16 items and set targets for the five KPI items.', 'Low', 'Transformation Lead', '2027-01-31'::date, 'Open', 'Makes the new workstream measurable from day one.', NULL, 'Assign owner roles and KPI targets for the Years 4-5 items after CR-03.', 'CSI HOD', NULL);

DO $$
DECLARE v_plan uuid := '71878149-378d-477a-a916-6cc4ef01b5c8'; v_hod uuid; r record; v_next int; v_id uuid; n int := 0;
BEGIN
  SELECT locked_by INTO v_hod FROM cmp_plans WHERE id = v_plan;
  IF v_hod IS NULL THEN RAISE EXCEPTION 'The plan has no locked_by staff id to attribute the entries to'; END IF;
  IF EXISTS (SELECT 1 FROM cmp_issue_log l JOIN _log t ON t.descr = l.description WHERE l.plan_id = v_plan) THEN
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
