-- ════════════════════════════════════════════════════════════════════════════
-- Migration 057: CMP S-Curve — snapshot capture rules
-- Reference: 04_DASHBOARD_SCURVE (Baseline vs Forecast vs Actual), TC08
-- Depends on: cmp_snapshots (049), cmp_role_capabilities (052/053)
--
-- 1. One plan-level snapshot per quarter. 049's UNIQUE (plan_id,
--    workstream_id, period_code) never fires for plan-level rows because
--    workstream_id is NULL and NULLs are distinct, so a partial unique index
--    closes that gap (and lets the app upsert with ON CONFLICT).
-- 2. A quarter-end job has no signed-in person, so captured_by becomes
--    nullable, with capture_source saying who/what took the snapshot. A
--    'Manual' snapshot must still name the HOD who took it.
-- 3. New capability take_snapshot, held by HOD only.
--
-- Run as the table owner / postgres (csidop_app cannot ALTER).
-- Existing data: cmp_snapshots is empty on every environment today.
-- ════════════════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS uq_cmpsnapshots_plan_period
    ON cmp_snapshots (plan_id, period_code)
    WHERE workstream_id IS NULL;

ALTER TABLE cmp_snapshots ALTER COLUMN captured_by DROP NOT NULL;

ALTER TABLE cmp_snapshots
    ADD COLUMN IF NOT EXISTS capture_source VARCHAR(12) NOT NULL DEFAULT 'Manual';

ALTER TABLE cmp_snapshots DROP CONSTRAINT IF EXISTS chk_cmpsnapshots_source;
ALTER TABLE cmp_snapshots ADD CONSTRAINT chk_cmpsnapshots_source
    CHECK (capture_source IN ('Manual', 'QuarterEnd') AND (capture_source <> 'Manual' OR captured_by IS NOT NULL));

COMMENT ON COLUMN cmp_snapshots.capture_source IS 'Manual = taken by the HOD from the dashboard; QuarterEnd = taken by the scheduled quarter-end job (captured_by is NULL).';
COMMENT ON TABLE cmp_snapshots IS 'Historical S-Curve points (source: 04_DASHBOARD_SCURVE). workstream_id NULL = overall-plan snapshot. One row per plan per quarter. While the quarter is still running the app may refresh its row (latest reading wins, snapshot_date moves with it); once the quarter has ended the row is frozen and is never overwritten (TC08: historical S-Curve preserves prior actual progress). A quarter that ended with no snapshot stays empty: it cannot be reconstructed honestly.';

ALTER TABLE cmp_role_capabilities DROP CONSTRAINT IF EXISTS chk_cmprolecapabilities_code;
ALTER TABLE cmp_role_capabilities ADD CONSTRAINT chk_cmprolecapabilities_code CHECK (capability_code IN (
    'manage_role_capabilities', 'manage_periods',
    'manage_hierarchy', 'manage_weights',
    'approve_baseline', 'lock_plan', 'override_critical_gate',
    'manage_workstream_items', 'update_progress', 'update_item_progress',
    'verify_evidence',
    'edit_revenue_model', 'verify_financial_assumptions',
    'manage_healthcare_workstream',
    'record_decisions', 'close_issues',
    'take_snapshot'
));

INSERT INTO cmp_role_capabilities (role_id, capability_code)
SELECT r.id, 'take_snapshot' FROM role r WHERE r.rolecode = 'HOD'
ON CONFLICT (role_id, capability_code) DO NOTHING;
