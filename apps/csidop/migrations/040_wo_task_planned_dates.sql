-- Migration 040: Planned start/end dates on WO tasks (for the per-WO Gantt chart)
-- WO_TASK only stored DateCreated (identical for template-created tasks) and
-- DateCompleted, so there was nothing to draw a plan from. Planned dates are
-- optional: tasks without them show as "unscheduled" on the Gantt, and an
-- Auto-schedule action can spread them across the WO's start and due date.
ALTER TABLE wo_task ADD COLUMN PlannedStart DATE;
ALTER TABLE wo_task ADD COLUMN PlannedEnd DATE;

ALTER TABLE wo_task ADD CONSTRAINT chk_wotask_plannedrange
  CHECK (PlannedStart IS NULL OR PlannedEnd IS NULL OR PlannedEnd >= PlannedStart);

COMMENT ON COLUMN wo_task.PlannedStart IS 'Planned start date for the Gantt chart; optional';
COMMENT ON COLUMN wo_task.PlannedEnd IS 'Planned end date for the Gantt chart; optional, never before PlannedStart';
