-- ══════════════════════════════════════════════════════════════════════════════
-- CR-03 REVERT: remove WS12 and restore the original workstream weights
-- Plan: CSI-5 Year Transformation Plan (71878149-378d-477a-a916-6cc4ef01b5c8)
-- Source: docs/cmp-transformation/change-requests/CR-2026-01_baseline_change_pack.md
--
-- Deletes WS12 (and its initiative, factors and items) and puts the 11 workstream weights back. Refuses if anyone has started using WS12 (progress update, evidence or issue), so no progress data is ever deleted.
--
-- Run on the VM from the repo root, as postgres, in the production database, ONLY after the
-- HOD has approved the change request. Rehearse first with the dry-run switch (everything
-- is rolled back):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/change-requests/sql/CR-03_revert.sql
-- Real run (drop the dry_run switch):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -f - < docs/cmp-transformation/change-requests/sql/CR-03_revert.sql
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

CREATE TEMP TABLE _cr03_w (ws text, old_w numeric(6,4), new_w numeric(6,4)) ON COMMIT DROP;
INSERT INTO _cr03_w VALUES
  ('WS01', 0.1200, 0.1080),
  ('WS02', 0.1000, 0.0900),
  ('WS03', 0.1000, 0.0900),
  ('WS04', 0.1200, 0.1080),
  ('WS05', 0.1000, 0.0900),
  ('WS06', 0.1000, 0.0900),
  ('WS07', 0.1000, 0.0900),
  ('WS08', 0.0800, 0.0720),
  ('WS09', 0.0800, 0.0720),
  ('WS10', 0.0600, 0.0540),
  ('WS11', 0.0400, 0.0360);

DO $$
DECLARE v_plan uuid := '71878149-378d-477a-a916-6cc4ef01b5c8'; v_hod uuid; v_ws uuid; r record; v_total numeric;
BEGIN
  SELECT locked_by INTO v_hod FROM cmp_plans WHERE id = v_plan;
  SELECT id INTO v_ws FROM cmp_workstreams WHERE plan_id = v_plan AND workstream_code = 'WS12';
  IF v_ws IS NULL THEN RAISE EXCEPTION 'WS12 does not exist; nothing to revert'; END IF;
  IF EXISTS (SELECT 1 FROM cmp_item_updates u JOIN cmp_items it ON it.id = u.item_id JOIN cmp_factors f ON f.id = it.factor_id
             JOIN cmp_initiatives i ON i.id = f.initiative_id WHERE i.workstream_id = v_ws)
     OR EXISTS (SELECT 1 FROM cmp_evidence e JOIN cmp_items it ON it.id = e.item_id JOIN cmp_factors f ON f.id = it.factor_id
             JOIN cmp_initiatives i ON i.id = f.initiative_id WHERE i.workstream_id = v_ws)
     OR EXISTS (SELECT 1 FROM cmp_issue_log l JOIN cmp_items it ON it.id = l.related_item_id JOIN cmp_factors f ON f.id = it.factor_id
             JOIN cmp_initiatives i ON i.id = f.initiative_id WHERE i.workstream_id = v_ws) THEN
    RAISE EXCEPTION 'WS12 already has progress, evidence or issues recorded; refusing to delete it';
  END IF;

  FOR r IN SELECT w.id, c.ws, c.old_w, c.new_w, w.weight AS cur_w FROM _cr03_w c JOIN cmp_workstreams w ON w.plan_id = v_plan AND w.workstream_code = c.ws ORDER BY w.sort_order LOOP
    IF r.cur_w IS DISTINCT FROM r.new_w THEN RAISE EXCEPTION '% weight is %, expected % after CR-03: changed since, refusing to revert', r.ws, r.cur_w, r.new_w; END IF;
    UPDATE cmp_workstreams SET weight = r.old_w, updated_at = now() WHERE id = r.id;
    PERFORM pg_temp.cr_audit('cmp_workstreams', r.id, 'Update', 'weight', r.new_w::text, r.old_w::text, 'CR-2026-01 / CR-03 reverted', v_hod);
  END LOOP;

  PERFORM pg_temp.cr_audit('cmp_workstreams', v_ws, 'Delete', NULL, 'WS12 Sustain & Expand (Year 4-5), weight 0.1000', NULL, 'CR-2026-01 / CR-03 reverted', v_hod);
  DELETE FROM cmp_workstreams WHERE id = v_ws;  -- cascades to initiative, factors and items

  SELECT sum(weight) INTO v_total FROM cmp_workstreams WHERE plan_id = v_plan;
  IF v_total <> 1 THEN RAISE EXCEPTION 'Workstream weights total % after revert, expected 1.0000', v_total; END IF;
  RAISE NOTICE 'CR-03 reverted: WS12 removed, weights restored.';
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
