-- Migration 045: SVP-Department sign-off and the wording of the printed form
-- The paper form ends with sign-off boxes (Employee, Reviewer, HOD,
-- SVP-Department, SVP-Operations, Received by HR) and a career recommendation
-- tick-list for the HOD and the SVP. The HOD and SVP ticks and the SVP-Operations
-- name and date already have columns on KPI_APPRAISAL; this adds the
-- SVP-Department signature and puts the fixed wording of the form into the
-- cycle settings so it can be changed without code.

ALTER TABLE KPI_APPRAISAL
    ADD COLUMN SvpDeptSignedAt TIMESTAMPTZ,
    ADD COLUMN SvpDeptSignedBy UUID REFERENCES STAFF(Id) ON DELETE RESTRICT;
COMMENT ON COLUMN KPI_APPRAISAL.SvpDeptSignedAt IS 'When the SVP signed the appraisal off as SVP-Department (the signature box on the form)';

UPDATE KPI_CYCLE
SET Config = Config
    || jsonb_build_object(
         'ratingScale', jsonb_build_object(
           '5', 'Excellent / Fully Achieved: Target fully achieved or exceeded with complete evidence',
           '4', 'Good / Mostly Achieved: Target mostly achieved with minor gap or delay',
           '3', 'Meets Minimum Expectation: Acceptable achievement with noticeable gap or partial completion',
           '2', 'Below Expectation: Weak or inconsistent achievement; improvement required',
           '1', 'Poor / Not Achieved: Target not achieved or insufficient evidence'),
         'outcomeRemark', 'All eligibility is subjected to company overall performances and based on MCC approval')
WHERE NOT (Config ? 'ratingScale');
