-- ══════════════════════════════════════════════════════════════════════════════
-- CR-03 APPLY: add WS12 Sustain & Expand (Years 4-5) and rescale the other workstream weights
-- Plan: CSI-5 Year Transformation Plan (71878149-378d-477a-a916-6cc4ef01b5c8)
-- Source: docs/cmp-transformation/change-requests/CR-2026-01_baseline_change_pack.md
--
-- Adds one workstream, one initiative, 8 factors and 16 items (Jul 2029 to Jun 2031) at a 10% plan weight, and multiplies the 11 existing workstream weights by 0.90 so every level still totals exactly 100%.
--
-- Run on the VM from the repo root, as postgres, in the production database, ONLY after the
-- HOD has approved the change request. Rehearse first with the dry-run switch (everything
-- is rolled back):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -v dry_run=1 -f - < docs/cmp-transformation/change-requests/sql/CR-03_apply.sql
-- Real run (drop the dry_run switch):
--   sudo -u postgres psql -d csidop -v ON_ERROR_STOP=1 -f - < docs/cmp-transformation/change-requests/sql/CR-03_apply.sql
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
CREATE TEMP TABLE _cr03_i (fcode text, fno int, fname text, fweight numeric(6,4), icode text, ino int, iname text,
                           method text, gate boolean, evid boolean, s date, t date) ON COMMIT DROP;
INSERT INTO _cr03_i VALUES
  ('FAC-12-REC', 1, 'Recurring revenue', 0.2000, 'IT199', 1, 'Recurring-revenue share of total revenue reaches target', 'KPI', false, false, '2029-07-01', '2031-06-30'),
  ('FAC-12-REC', 1, 'Recurring revenue', 0.2000, 'IT200', 2, 'Managed-service / subscription run-rate in place', 'Stage', false, true, '2029-07-01', '2030-06-30'),
  ('FAC-12-REN', 2, 'Renewals and retention', 0.1500, 'IT201', 1, 'Contract renewal rate meets target', 'KPI', false, false, '2029-10-01', '2031-06-30'),
  ('FAC-12-REN', 2, 'Renewals and retention', 0.1500, 'IT202', 2, 'Renewal and retention review cycle operating', 'Stage', false, true, '2029-07-01', '2030-03-31'),
  ('FAC-12-MAR', 3, 'Margin', 0.1500, 'IT203', 1, 'Gross margin meets target in each subsidiary', 'KPI', false, false, '2029-10-01', '2031-06-30'),
  ('FAC-12-MAR', 3, 'Margin', 0.1500, 'IT204', 2, 'Cost-to-serve review and pricing refresh completed', 'Stage', false, true, '2029-07-01', '2030-06-30'),
  ('FAC-12-XSL', 4, 'Cross-sell', 0.1000, 'IT205', 1, 'Cross-sell playbook live across subsidiaries', 'Stage', false, true, '2029-07-01', '2030-03-31'),
  ('FAC-12-XSL', 4, 'Cross-sell', 0.1000, 'IT206', 2, 'Cross-sell revenue meets target', 'KPI', false, false, '2030-01-01', '2031-06-30'),
  ('FAC-12-MKT', 5, 'Market expansion', 0.1500, 'IT207', 1, 'New market / segment entry decision approved', 'Approval', true, true, '2029-10-01', '2030-09-30'),
  ('FAC-12-MKT', 5, 'Market expansion', 0.1500, 'IT208', 2, 'New-market pipeline meets target', 'KPI', false, false, '2030-07-01', '2031-06-30'),
  ('FAC-12-IPR', 6, 'Intellectual property', 0.1000, 'IT209', 1, 'IP inventory and protection plan approved', 'Approval', false, true, '2029-07-01', '2030-03-31'),
  ('FAC-12-IPR', 6, 'Intellectual property', 0.1000, 'IT210', 2, 'Reusable IP productised and registered', 'Stage', false, true, '2030-01-01', '2031-03-31'),
  ('FAC-12-SUB', 7, 'Subsidiary decisions', 0.1000, 'IT211', 1, 'Year 4 review of each subsidiary: continue, scale or merge', 'Approval', true, true, '2030-04-01', '2030-09-30'),
  ('FAC-12-SUB', 7, 'Subsidiary decisions', 0.1000, 'IT212', 2, 'Decision on any further subsidiary approved', 'Approval', true, true, '2030-07-01', '2031-03-31'),
  ('FAC-12-NXT', 8, 'Next growth plan', 0.0500, 'IT213', 1, 'Next growth plan drafted', 'Stage', false, true, '2030-07-01', '2031-03-31'),
  ('FAC-12-NXT', 8, 'Next growth plan', 0.0500, 'IT214', 2, 'Next growth plan approved', 'Approval', true, true, '2031-01-01', '2031-06-30');

DO $$
DECLARE
  v_plan uuid := '71878149-378d-477a-a916-6cc4ef01b5c8'; v_hod uuid; v_ws uuid; v_ini uuid; v_fac uuid; v_item uuid; v_status text;
  r record; ri record; n_items int := 0; n_fac int := 0; v_total numeric;
BEGIN
  SELECT locked_by INTO v_hod FROM cmp_plans WHERE id = v_plan;
  IF EXISTS (SELECT 1 FROM cmp_workstreams WHERE plan_id = v_plan AND workstream_code = 'WS12') THEN
    RAISE EXCEPTION 'WS12 already exists; refusing to add it twice';
  END IF;
  IF EXISTS (SELECT 1 FROM cmp_items it JOIN cmp_factors f ON f.id = it.factor_id JOIN cmp_initiatives i ON i.id = f.initiative_id
             JOIN cmp_workstreams w ON w.id = i.workstream_id WHERE w.plan_id = v_plan AND it.item_code IN (SELECT icode FROM _cr03_i)) THEN
    RAISE EXCEPTION 'An item code IT199 to IT214 is already in use';
  END IF;

  -- The 11 current weights must be exactly what the pack was built on, and total 100%.
  FOR r IN SELECT c.ws, c.old_w, w.weight AS cur_w FROM _cr03_w c LEFT JOIN cmp_workstreams w ON w.plan_id = v_plan AND w.workstream_code = c.ws LOOP
    IF r.cur_w IS DISTINCT FROM r.old_w THEN RAISE EXCEPTION '% weight is %, expected %: changed since the proposal', r.ws, r.cur_w, r.old_w; END IF;
  END LOOP;
  SELECT sum(weight) INTO v_total FROM cmp_workstreams WHERE plan_id = v_plan;
  IF v_total <> 1 THEN RAISE EXCEPTION 'Workstream weights total %, expected 1.0000', v_total; END IF;

  -- Rescale the existing workstreams.
  FOR r IN SELECT w.id, c.ws, c.old_w, c.new_w FROM _cr03_w c JOIN cmp_workstreams w ON w.plan_id = v_plan AND w.workstream_code = c.ws ORDER BY w.sort_order LOOP
    UPDATE cmp_workstreams SET weight = r.new_w, updated_at = now() WHERE id = r.id;
    PERFORM pg_temp.cr_audit('cmp_workstreams', r.id, 'Update', 'weight', r.old_w::text, r.new_w::text,
            'CR-2026-01 / CR-03 approved by HOD: weights x0.90 to make room for WS12; applied by script', v_hod);
  END LOOP;

  -- New workstream, same status as WS01, owner and sponsor as WS01 (HOD decision).
  SELECT status INTO v_status FROM cmp_workstreams WHERE plan_id = v_plan AND workstream_code = 'WS01';
  INSERT INTO cmp_workstreams (plan_id, workstream_code, name, weight, sort_order, status, owner_role_title, sponsor_role_title, created_by)
  VALUES (v_plan, 'WS12', 'Sustain & Expand (Year 4-5)', 0.1000, 12, v_status, 'Transformation Lead', 'Management', v_hod)
  RETURNING id INTO v_ws;
  PERFORM pg_temp.cr_audit('cmp_workstreams', v_ws, 'Insert', NULL, NULL,
          'WS12 Sustain & Expand (Year 4-5), weight 0.1000', 'CR-2026-01 / CR-03 approved by HOD; applied by script', v_hod);

  INSERT INTO cmp_initiatives (workstream_id, initiative_code, name, weight, sort_order, created_by)
  VALUES (v_ws, 'INIT-12-01', 'Sustain & Expand Readiness', 1.0000, 1, v_hod) RETURNING id INTO v_ini;
  PERFORM pg_temp.cr_audit('cmp_initiatives', v_ini, 'Insert', NULL, NULL, 'INIT-12-01, weight 1.0000', 'CR-2026-01 / CR-03', v_hod);

  FOR r IN SELECT DISTINCT fcode, fno, fname, fweight FROM _cr03_i ORDER BY fno LOOP
    INSERT INTO cmp_factors (initiative_id, factor_code, name, weight, sort_order, created_by)
    VALUES (v_ini, r.fcode, r.fname, r.fweight, r.fno, v_hod) RETURNING id INTO v_fac;
    PERFORM pg_temp.cr_audit('cmp_factors', v_fac, 'Insert', NULL, NULL, r.fcode || ' ' || r.fname || ', weight ' || r.fweight, 'CR-2026-01 / CR-03', v_hod);
    n_fac := n_fac + 1;
    FOR ri IN SELECT * FROM _cr03_i i WHERE i.fcode = r.fcode ORDER BY i.ino LOOP
      INSERT INTO cmp_items (factor_id, item_code, name, weight, scoring_method, critical_gate, evidence_required, owner_role_title, start_date, target_date, created_by)
      VALUES (v_fac, ri.icode, ri.iname, 0.5000, ri.method, ri.gate, ri.evid, 'Workstream owner (to be confirmed)', ri.s, ri.t, v_hod) RETURNING id INTO v_item;
      PERFORM pg_temp.cr_audit('cmp_items', v_item, 'Insert', NULL, NULL,
              ri.icode || ' ' || ri.iname || ' (' || ri.method || '), ' || ri.s || ' to ' || ri.t, 'CR-2026-01 / CR-03', v_hod);
      n_items := n_items + 1;
    END LOOP;
  END LOOP;

  IF n_fac <> 8 OR n_items <> 16 THEN RAISE EXCEPTION 'Expected 8 factors and 16 items, created % and %', n_fac, n_items; END IF;

  -- Every sibling group must total exactly 100% (TC01).
  SELECT sum(weight) INTO v_total FROM cmp_workstreams WHERE plan_id = v_plan;
  IF v_total <> 1 THEN RAISE EXCEPTION 'Workstream weights now total %, expected 1.0000', v_total; END IF;
  SELECT sum(weight) INTO v_total FROM cmp_initiatives WHERE workstream_id = v_ws;
  IF v_total <> 1 THEN RAISE EXCEPTION 'WS12 initiative weights total %', v_total; END IF;
  SELECT sum(weight) INTO v_total FROM cmp_factors WHERE initiative_id = v_ini;
  IF v_total <> 1 THEN RAISE EXCEPTION 'WS12 factor weights total %', v_total; END IF;
  IF EXISTS (SELECT 1 FROM cmp_items it JOIN cmp_factors f ON f.id = it.factor_id WHERE f.initiative_id = v_ini GROUP BY f.id HAVING sum(it.weight) <> 1) THEN
    RAISE EXCEPTION 'A WS12 factor''s item weights do not total 1.0000';
  END IF;
  RAISE NOTICE 'CR-03: WS12 added (8 factors, 16 items); workstream weights rescaled and total 1.0000.';
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
