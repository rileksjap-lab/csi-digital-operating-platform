-- Migration 043: KPI appraisals (the filled-in forms and their workflow)
-- One KPI_APPRAISAL per person per cycle. The person rates themselves, their
-- immediate superior (ReviewerId, from STAFF.ReportsTo) rates them, the final
-- approver (the HOD, or the SVP for the HOD) sets the final score, and the
-- result is then sent to HR. Self, reviewer and final ratings are kept apart so
-- nothing is overwritten and the form can show all three side by side.

CREATE TABLE KPI_APPRAISAL (
    Id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CycleId           UUID NOT NULL REFERENCES KPI_CYCLE(Id) ON DELETE RESTRICT,
    StaffId           UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    TemplateId        UUID NOT NULL REFERENCES KPI_TEMPLATE(Id) ON DELETE RESTRICT,
    ReviewerId        UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    FinalApproverId   UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    Status            VARCHAR(20) NOT NULL DEFAULT 'SelfAssessment',
    ReturnNote        TEXT,
    SelfSubmittedAt   TIMESTAMPTZ,
    ReviewSubmittedAt TIMESTAMPTZ,
    FinalisedAt       TIMESTAMPTZ,
    SentToHrAt        TIMESTAMPTZ,
    SentToHrBy        UUID REFERENCES STAFF(Id) ON DELETE RESTRICT,
    KraPoints         NUMERIC(6,2),
    ValuePoints       NUMERIC(6,2),
    BonusPoints       NUMERIC(6,2),
    TotalPoints       NUMERIC(6,2),
    Outcome           TEXT,
    Recommendations   JSONB NOT NULL DEFAULT '{}'::jsonb,
    SvpOpsName        VARCHAR(150),
    SvpOpsDate        DATE,
    CreatedAt         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt         TIMESTAMPTZ,
    CONSTRAINT uq_kpiappraisal_cycle_staff UNIQUE (CycleId, StaffId),
    CONSTRAINT chk_kpiappraisal_status CHECK (Status IN ('SelfAssessment','SuperiorReview','HODReview','Finalised','SentToHR')),
    CONSTRAINT chk_kpiappraisal_reviewer CHECK (ReviewerId <> StaffId),
    CONSTRAINT chk_kpiappraisal_approver CHECK (FinalApproverId <> StaffId),
    CONSTRAINT chk_kpiappraisal_result CHECK (
        (Status IN ('Finalised','SentToHR')) = (TotalPoints IS NOT NULL)
    )
);
CREATE INDEX idx_kpiappraisal_staff ON KPI_APPRAISAL(StaffId);
CREATE INDEX idx_kpiappraisal_reviewer ON KPI_APPRAISAL(ReviewerId);
CREATE INDEX idx_kpiappraisal_approver ON KPI_APPRAISAL(FinalApproverId);
COMMENT ON TABLE KPI_APPRAISAL IS 'A person''s KPI appraisal for one cycle. The points and outcome are a snapshot taken when the appraisal is finalised, so later edits to weights cannot change a finished result.';
COMMENT ON COLUMN KPI_APPRAISAL.ReviewerId IS 'Immediate superior at the time the appraisal was opened (copied from STAFF.ReportsTo)';
COMMENT ON COLUMN KPI_APPRAISAL.FinalApproverId IS 'Sets the final score: the HOD, or the SVP for the HOD''s own appraisal. When this is the same person as ReviewerId the HOD review step is skipped.';
COMMENT ON COLUMN KPI_APPRAISAL.ReturnNote IS 'Why the appraisal was last sent back a step; shown to the person who has to redo it';

-- ── One row per rated line or item ──────────────────────────────────────────
CREATE TABLE KPI_APPRAISAL_SCORE (
    Id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AppraisalId      UUID NOT NULL REFERENCES KPI_APPRAISAL(Id) ON DELETE CASCADE,
    LineId           UUID REFERENCES KPI_TEMPLATE_LINE(Id) ON DELETE RESTRICT,
    ItemId           UUID REFERENCES KPI_ITEM(Id) ON DELETE RESTRICT,
    SelfRating       SMALLINT,
    SelfComment      TEXT,
    SelfEvidence     TEXT,
    ReviewerRating   SMALLINT,
    ReviewerComment  TEXT,
    ReviewerEvidence TEXT,
    FinalRating      SMALLINT,
    FinalComment     TEXT,
    UpdatedAt        TIMESTAMPTZ,
    CONSTRAINT chk_kpiscore_target CHECK ((LineId IS NOT NULL)::int + (ItemId IS NOT NULL)::int = 1),
    CONSTRAINT uq_kpiscore_line UNIQUE (AppraisalId, LineId),
    CONSTRAINT uq_kpiscore_item UNIQUE (AppraisalId, ItemId),
    CONSTRAINT chk_kpiscore_self CHECK (SelfRating IS NULL OR SelfRating BETWEEN 1 AND 10),
    CONSTRAINT chk_kpiscore_reviewer CHECK (ReviewerRating IS NULL OR ReviewerRating BETWEEN 1 AND 10),
    CONSTRAINT chk_kpiscore_final CHECK (FinalRating IS NULL OR FinalRating BETWEEN 1 AND 10)
);
COMMENT ON COLUMN KPI_APPRAISAL_SCORE.SelfEvidence IS 'What supports the rating (records, files, trackers); a rating above 3 needs some evidence when the line asks for it';

-- ── Employee Certifications (item 8): the points table of the form ─────────
CREATE TABLE KPI_APPRAISAL_CERT (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AppraisalId UUID NOT NULL REFERENCES KPI_APPRAISAL(Id) ON DELETE CASCADE,
    Name        VARCHAR(200) NOT NULL,
    YearLabel   VARCHAR(20),
    Category    VARCHAR(30) NOT NULL,
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kpicert_appraisal ON KPI_APPRAISAL_CERT(AppraisalId);
COMMENT ON TABLE KPI_APPRAISAL_CERT IS 'Certificates listed on the form. Points and the item score are calculated from the cycle''s certification rules, never typed in.';

-- ── The 1:1 meeting with the immediate superior ─────────────────────────────
CREATE TABLE KPI_ONE_ON_ONE (
    Id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AppraisalId   UUID NOT NULL REFERENCES KPI_APPRAISAL(Id) ON DELETE CASCADE,
    MeetingDate   DATE NOT NULL,
    Notes         TEXT,
    AgreedActions TEXT,
    RecordedBy    UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    RecordedAt    TIMESTAMPTZ NOT NULL DEFAULT now(),
    EmployeeAckAt TIMESTAMPTZ,
    CONSTRAINT uq_kpioneonone_appraisal UNIQUE (AppraisalId)
);

-- Career recommendation tick-list on Section 3 of the form (editable per cycle)
UPDATE KPI_CYCLE
SET Config = Config || '{"careerOptions": ["Confirmation","Increment","Promotion","Lateral Move","Performance Improvement Plan","No Change"]}'::jsonb
WHERE NOT (Config ? 'careerOptions');

GRANT SELECT, INSERT, UPDATE, DELETE ON KPI_APPRAISAL, KPI_APPRAISAL_SCORE, KPI_APPRAISAL_CERT, KPI_ONE_ON_ONE TO csidop_app;
