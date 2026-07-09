-- ════════════════════════════════════════════════════════════════════════════
-- Migration 020: Add status column to WO_TASK
-- Supports "N/A" marking — baseline tender tasks that don't apply to this
-- specific tender can be marked N/A instead of deleted, preserving audit trail.
-- Progress calculation excludes N/A tasks.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE wo_task ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'Active';
ALTER TABLE wo_task ADD CONSTRAINT chk_wotask_status CHECK (status IN ('Active', 'NA'));

COMMENT ON COLUMN wo_task.status IS 'Active = actionable task, NA = not applicable (excluded from progress)';

COMMIT;
