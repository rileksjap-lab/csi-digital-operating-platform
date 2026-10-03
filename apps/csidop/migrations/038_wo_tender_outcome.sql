-- Migration 038: Track tender win/loss directly on CSI_WO
-- The TENDER table already has a Won/Lost Status + WinValue, and the
-- original design linked CSI_WO.TenderId to it — but in practice the
-- Tenders module has never had real data entered (CMT owns tender intake
-- and doesn't have its own system yet, see CMTDOP architecture notes), so
-- there's nothing for a "Tender / RFP" WO to link to. Track the outcome
-- directly on the WO instead, independent of the TENDER table.
ALTER TABLE csi_wo ADD COLUMN TenderOutcome VARCHAR(10);
ALTER TABLE csi_wo ADD COLUMN TenderOutcomeValue NUMERIC(15,2);
ALTER TABLE csi_wo ADD COLUMN TenderOutcomeDate TIMESTAMPTZ;

ALTER TABLE csi_wo ADD CONSTRAINT chk_csiwo_tenderoutcome
  CHECK (TenderOutcome IS NULL OR TenderOutcome IN ('Won', 'Lost'));
ALTER TABLE csi_wo ADD CONSTRAINT chk_csiwo_tenderoutcomevalue
  CHECK (TenderOutcomeValue IS NULL OR TenderOutcomeValue >= 0);

COMMENT ON COLUMN csi_wo.TenderOutcome IS 'Won/Lost outcome for a "Tender / RFP" WO, set directly on the WO — not derived from the (currently unused) TENDER table';
COMMENT ON COLUMN csi_wo.TenderOutcomeValue IS 'Optional win value (RM) recorded when TenderOutcome is set to Won';
COMMENT ON COLUMN csi_wo.TenderOutcomeDate IS 'When TenderOutcome was first set — used to filter the OO leaderboard/report by period';
