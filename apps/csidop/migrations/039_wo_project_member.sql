-- Migration 039: Project team on a won Tender / RFP work order
-- When a tender is awarded it becomes a project. The OO (the WO's single
-- current assignee, enforced by uq_assignment_one_current_per_wo) stays as is,
-- and other CSI staff can be assigned to look after the project on CSI's
-- behalf. That needs many people per WO, which ASSIGNMENT can't model, so
-- they get their own table. This is a record of who is on the project only:
-- it deliberately does not feed capacity, effort logging or My Tasks.
CREATE TABLE WO_PROJECT_MEMBER (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CSI_WO_Id   UUID NOT NULL REFERENCES CSI_WO(Id) ON DELETE CASCADE,
    StaffId     UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    RoleNote    VARCHAR(100),
    AddedBy     UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    AddedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_woprojectmember_wo_staff UNIQUE (CSI_WO_Id, StaffId)
);
CREATE INDEX idx_woprojectmember_wo ON WO_PROJECT_MEMBER(CSI_WO_Id);
CREATE INDEX idx_woprojectmember_staff ON WO_PROJECT_MEMBER(StaffId);

COMMENT ON TABLE WO_PROJECT_MEMBER IS 'CSI staff assigned to the project that results from a won Tender / RFP WO; informational, separate from the single OO assignee on CSI_WO';
COMMENT ON COLUMN WO_PROJECT_MEMBER.RoleNote IS 'Optional free-text note on what this person looks after, e.g. Project Manager';

GRANT SELECT, INSERT, UPDATE, DELETE ON WO_PROJECT_MEMBER TO csidop_app;
