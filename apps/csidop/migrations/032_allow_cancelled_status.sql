-- Migration 032: Allow 'Cancelled' status on CSI_WO
-- The Cancel WO feature was shipped without updating chk_csiwo_status, so
-- every cancellation attempt (cancelWorkOrder in wo.repo.ts) fails with:
--   "new row for relation csi_wo violates check constraint chk_csiwo_status"
-- Approved/Returned decisions map to Closed/InProgress internally (see
-- approveWorkOrder in wo.repo.ts) and never touch csi_wo.status directly, so
-- Cancelled is the only value actually missing from the original list.

ALTER TABLE csi_wo DROP CONSTRAINT chk_csiwo_status;
ALTER TABLE csi_wo ADD CONSTRAINT chk_csiwo_status
  CHECK (Status IN ('Open','InProgress','PendingApproval','Closed','OnHold','Cancelled'));
