-- ══════════════════════════════════════════════════════════════════════════════
-- Risk Register and Action Log: remove the starter entries
-- Plan: CSI-5 Year Transformation Plan (71878149-378d-477a-a916-6cc4ef01b5c8)
-- Source: docs/cmp-transformation/risk-action-log/README.md
--
-- Deletes exactly the entries that LOG_seed_apply.sql (either wording version) added, matched by their text. Entries added by hand are never touched.
--
-- Run on the VM from the repo root, as postgres, in the production database, after the HOD has
-- reviewed the entries. Rehearse first with the dry-run switch (everything
-- is rolled back):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/risk-action-log/LOG_seed_revert.sql
-- Real run (drop the dry_run switch):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -f - < docs/cmp-transformation/risk-action-log/LOG_seed_revert.sql
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

CREATE TEMP TABLE _log (descr text) ON COMMIT DROP;
INSERT INTO _log VALUES
  ('The groundwork workstreams (New Co, pricing, finance, organisation and governance) are running behind plan, while the subsidiaries are due to start soon and rely on them.'),
  ('The financial case for the subsidiaries is not yet signed off, and every subsidiary investment decision depends on it.'),
  ('Cloud, BIM and Cybersecurity are all scheduled to start and finish together, with no agreed order of priority.'),
  ('Almost every workstream is active at the same time in the first half of 2027, which is more than the team can comfortably carry.'),
  ('Some subsidiary work is recorded as started even though the plan has not begun and no evidence is attached.'),
  ('A large part of the plan has no progress entered yet, so the readiness picture rests on incomplete information.'),
  ('Every item in a workstream currently shares the same dates, which makes the groundwork workstreams look further behind than they really are.'),
  ('No workstream has a named owner or sponsor recorded yet.'),
  ('The governance workstream finishes well before the subsidiaries have launched, although decisions and gates continue much longer.'),
  ('The approved plan stops at the end of 2028, so nothing is planned for the later years.'),
  ('Workstream owners are still getting used to updating progress in CSIDOP.'),
  ('In what order should the three subsidiaries launch, and should their start dates be staggered?'),
  ('Can the team carry all the workstreams together, or which work should be postponed?'),
  ('Enter the approved owners and sponsors, the spread-out dates and the later-years workstream in CSIDOP.'),
  ('If the work is real, bring the planned start forward. If not, reset the items to Not Started.'),
  ('Each Red workstream owner records what is blocking them and what help is needed, before the review.'),
  ('Approve the rule that a subsidiary can only be set up as a company once the New Co mandate and the financial case are approved.'),
  ('Confirm who updates, by when each month, and who reviews.'),
  ('Confirm who meets, how often, and for how long.'),
  ('Name an owner for each item in the new workstream and set targets for the measurable ones.'),
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
DECLARE v_plan uuid := '71878149-378d-477a-a916-6cc4ef01b5c8'; v_hod uuid; r record; n int := 0;
BEGIN
  SELECT locked_by INTO v_hod FROM cmp_plans WHERE id = v_plan;
  FOR r IN SELECT l.id, l.log_code, l.description FROM cmp_issue_log l JOIN _log t ON t.descr = l.description WHERE l.plan_id = v_plan LOOP
    PERFORM pg_temp.cr_audit('cmp_issue_log', r.id, 'Delete', NULL, r.log_code || ' ' || left(r.description, 120), NULL, 'Starter entries removed', v_hod);
    DELETE FROM cmp_issue_log WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Removed % entries.', n;
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
