-- ════════════════════════════════════════════════════════════════════════════
-- Migration 034: Skill Self-Assessment Questionnaire
-- Extends 009_skills_certification.sql (SKILL, STAFF_SKILL) with a
-- self-service, quarterly, scored-rubric questionnaire. Staff submit answers
-- (0-3 per question); the computed level is written into STAFF_SKILL only
-- after a Team Lead / HOD confirms it — self-reported levels are never
-- trusted directly, since STAFF_SKILL feeds capacity/gap-planning views.
-- Depends on: STAFF, SKILL (009)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE SKILL_SELF_ASSESSMENT (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    StaffId             UUID NOT NULL REFERENCES STAFF(Id) ON DELETE CASCADE,
    SkillId             UUID NOT NULL REFERENCES SKILL(Id) ON DELETE CASCADE,
    QuarterLabel        VARCHAR(7) NOT NULL, -- e.g. '2026-Q3'
    Answers             JSONB NOT NULL,       -- {"understanding":2,"independence":3,...}
    TotalScore          SMALLINT NOT NULL,
    SuggestedLevel      VARCHAR(20) NOT NULL,
    Status              VARCHAR(20) NOT NULL DEFAULT 'PendingReview',
    ReviewedBy          UUID REFERENCES STAFF(Id) ON DELETE SET NULL,
    ReviewedAt          TIMESTAMPTZ,
    ReviewNote          VARCHAR(500),
    SubmittedAt         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt           TIMESTAMPTZ,
    CONSTRAINT uq_selfassessment_quarter UNIQUE (StaffId, SkillId, QuarterLabel),
    CONSTRAINT chk_selfassessment_status CHECK (Status IN ('PendingReview','Confirmed','Rejected')),
    CONSTRAINT chk_selfassessment_level CHECK (SuggestedLevel IN ('Beginner','Intermediate','Advanced','Expert')),
    CONSTRAINT chk_selfassessment_score CHECK (TotalScore BETWEEN 0 AND 15),
    -- Mirrors GONOGO_EVALUATION's override+reason pairing (007): a rejection
    -- must carry a reason, same as any other "send it back" decision in this app.
    CONSTRAINT chk_selfassessment_reject_reason CHECK (
        Status != 'Rejected' OR ReviewNote IS NOT NULL
    )
);
COMMENT ON TABLE SKILL_SELF_ASSESSMENT IS 'Quarterly self-service competency questionnaire; PendingReview until a Team Lead/HOD confirms, at which point STAFF_SKILL is updated';

CREATE INDEX idx_selfassessment_staff ON SKILL_SELF_ASSESSMENT(StaffId);
CREATE INDEX idx_selfassessment_status ON SKILL_SELF_ASSESSMENT(Status);

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON SKILL_SELF_ASSESSMENT
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
