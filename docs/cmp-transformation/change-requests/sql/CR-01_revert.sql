-- ══════════════════════════════════════════════════════════════════════════════
-- CR-01 REVERT: clear the workstream owner and sponsor titles
-- Plan: CSI-5 Year Transformation Plan (71878149-378d-477a-a916-6cc4ef01b5c8)
-- Source: docs/cmp-transformation/change-requests/CR-2026-01_baseline_change_pack.md
--
-- Puts owner_role_title and sponsor_role_title back to empty on the 11 workstreams (their state before CR-01).
--
-- Run on the VM from the repo root, as postgres, in the production database, ONLY after the
-- HOD has approved the change request. Rehearse first with the dry-run switch (everything
-- is rolled back):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/change-requests/sql/CR-01_revert.sql
-- Real run (drop the dry_run switch):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -f - < docs/cmp-transformation/change-requests/sql/CR-01_revert.sql
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
DECLARE v_plan uuid := '71878149-378d-477a-a916-6cc4ef01b5c8'; v_status text;
BEGIN
  SELECT baseline_status INTO v_status FROM cmp_plans WHERE id = v_plan;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Plan % not found: wrong database?', v_plan; END IF;
  IF v_status NOT IN ('Locked', 'Approved') THEN RAISE EXCEPTION 'Plan baseline is %, expected Locked or Approved', v_status; END IF;
END $$;

CREATE TEMP TABLE _cr01 (ws text, owner text, sponsor text) ON COMMIT DROP;
INSERT INTO _cr01 VALUES
  ('WS01', 'Transformation Lead', 'Management'),
  ('WS02', 'Cloud Lead', 'Management / Commercial'),
  ('WS03', 'BIM Lead', 'Management / Project Governance'),
  ('WS04', 'Cybersecurity Lead', 'Management / Security Sponsor'),
  ('WS05', 'Healthcare Lead', 'Management / Healthcare Sponsor'),
  ('WS06', 'Practice Leads', 'Management'),
  ('WS07', 'Commercial Lead', 'Management'),
  ('WS08', 'Finance Representative', 'Finance Management'),
  ('WS09', 'CSI HOD / HR', 'Management'),
  ('WS10', 'Product Owner / Tech Lead', 'CSI HOD'),
  ('WS11', 'CSI HOD / Management', 'Management');

DO $$
DECLARE v_plan uuid := '71878149-378d-477a-a916-6cc4ef01b5c8'; v_hod uuid; r record; n int := 0;
BEGIN
  SELECT locked_by INTO v_hod FROM cmp_plans WHERE id = v_plan;
  FOR r IN SELECT w.id, w.workstream_code, w.owner_role_title AS cur_owner, w.sponsor_role_title AS cur_sponsor, c.owner, c.sponsor
           FROM _cr01 c JOIN cmp_workstreams w ON w.plan_id = v_plan AND w.workstream_code = c.ws ORDER BY w.sort_order
  LOOP
    IF r.cur_owner IS DISTINCT FROM r.owner OR r.cur_sponsor IS DISTINCT FROM r.sponsor THEN
      RAISE EXCEPTION '% no longer matches CR-01 (now % / %); someone edited it since, refusing to revert', r.workstream_code, r.cur_owner, r.cur_sponsor;
    END IF;
    UPDATE cmp_workstreams SET owner_role_title = NULL, sponsor_role_title = NULL, updated_at = now() WHERE id = r.id;
    PERFORM pg_temp.cr_audit('cmp_workstreams', r.id, 'Update', 'owner_role_title', r.cur_owner, NULL, 'CR-2026-01 / CR-01 reverted', v_hod);
    PERFORM pg_temp.cr_audit('cmp_workstreams', r.id, 'Update', 'sponsor_role_title', r.cur_sponsor, NULL, 'CR-2026-01 / CR-01 reverted', v_hod);
    n := n + 1;
  END LOOP;
  IF n <> 11 THEN RAISE EXCEPTION 'Expected to revert 11 workstreams, reverted %', n; END IF;
  RAISE NOTICE 'CR-01 reverted: % workstreams.', n;
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
