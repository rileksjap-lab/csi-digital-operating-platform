-- ════════════════════════════════════════════════════════════════════════════
-- Migration 012: UpdatedAt Auto-Update Trigger
-- Reference: Database Design Specification v1.0 §1.4
-- "UpdatedAt (TIMESTAMP, nullable, set by application or trigger on update)"
--
-- This migration implements the trigger option: a single reusable trigger
-- function applied to every table, so the application layer never has to
-- remember to set UpdatedAt manually on every UPDATE statement.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.UpdatedAt = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_at() IS 'DB Spec §1.4 — standard UpdatedAt maintenance trigger, applied to every table below';

-- Applied to every table carrying an UpdatedAt column (all 25 tables except
-- AUDIT_LOG and STAFF_SKILL's composite-key pattern, both of which use their
-- own timestamp column — PerformedAt and LastAssessmentDate respectively —
-- as the meaningful "last touched" marker instead).
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'department','role','request_type','baseline_tier','multiplier_factor',
        'system_setting','complexity_tier','staff','external_wo','tender',
        'csi_wo','assignment','effort_log','evidence_deliverable','approval_record',
        'tender_scoring','gonogo_evaluation','kpi_record','oi_tracker',
        'skill','staff_skill','certification','training_plan','role_split'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I;
             CREATE TRIGGER trg_set_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            tbl, tbl
        );
    END LOOP;
END $$;
