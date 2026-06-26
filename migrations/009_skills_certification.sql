-- ════════════════════════════════════════════════════════════════════════════
-- Migration 009: Skills, Competency & Certification (v1.1)
-- Reference: Database Design Specification v1.0 §3.20–3.23
-- Tables: SKILL, STAFF_SKILL, CERTIFICATION, TRAINING_PLAN
-- Depends on: STAFF
-- ════════════════════════════════════════════════════════════════════════════

-- ── SKILL ───────────────────────────────────────────────────────────────────
-- DB Spec §3: "Skills inventory tagged to one of the eight configured
-- technology domains (PRD §7.15, FR-50)."
CREATE TABLE SKILL (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    SkillName           VARCHAR(100) NOT NULL,
    TechnologyDomain    VARCHAR(50) NOT NULL,
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt           TIMESTAMPTZ,
    CONSTRAINT uq_skill_name_domain UNIQUE (SkillName, TechnologyDomain),
    CONSTRAINT chk_skill_domain CHECK (TechnologyDomain IN
        ('Cloud','Cyber Security','Data Centre','Network','Enterprise Architecture','AI / HPC','BIM','Consultancy'))
);
COMMENT ON TABLE SKILL IS 'PRD §7.15, §11 — skills inventory across the 8 configured technology domains (FR-50)';

-- ── STAFF_SKILL ─────────────────────────────────────────────────────────────
-- DB Spec §3: "Many-to-many link recording each staff member's assessed
-- competency level per skill (FR-51)."
CREATE TABLE STAFF_SKILL (
    StaffId             UUID NOT NULL REFERENCES STAFF(Id) ON DELETE CASCADE,
    SkillId             UUID NOT NULL REFERENCES SKILL(Id) ON DELETE CASCADE,
    CompetencyLevel     VARCHAR(20) NOT NULL,
    LastAssessmentDate  DATE NOT NULL,
    AssessedBy          UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt           TIMESTAMPTZ,
    CONSTRAINT pk_staffskill PRIMARY KEY (StaffId, SkillId),
    CONSTRAINT chk_staffskill_level CHECK (CompetencyLevel IN ('Beginner','Intermediate','Advanced','Expert'))
);
COMMENT ON TABLE STAFF_SKILL IS 'PRD §7.15, §11 — assessed competency level per staff per skill (FR-51); no free text permitted for CompetencyLevel';

CREATE INDEX idx_staffskill_skill ON STAFF_SKILL(SkillId);

-- ── CERTIFICATION ───────────────────────────────────────────────────────────
-- DB Spec §3: "Per-staff certification register (PRD §7.15, FR-52–53)."
CREATE TABLE CERTIFICATION (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    StaffId             UUID NOT NULL REFERENCES STAFF(Id) ON DELETE CASCADE,
    CertificationName   VARCHAR(150) NOT NULL,
    Vendor              VARCHAR(100),
    CertificationLevel  VARCHAR(50),
    IssueDate           DATE NOT NULL,
    ExpiryDate          DATE,
    Status              VARCHAR(20) NOT NULL DEFAULT 'Unverified',
    EvidenceFile        VARCHAR(500),
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt           TIMESTAMPTZ,
    CONSTRAINT chk_certification_status CHECK (Status IN ('Unverified','Verified','Expired')),
    CONSTRAINT chk_certification_dates CHECK (ExpiryDate IS NULL OR ExpiryDate > IssueDate)
);
COMMENT ON TABLE CERTIFICATION IS 'PRD §7.15, §11 — per-staff certification register with expiry alerting (FR-52–53)';

CREATE INDEX idx_certification_expiry ON CERTIFICATION(ExpiryDate);
CREATE INDEX idx_certification_staff ON CERTIFICATION(StaffId);

-- ── TRAINING_PLAN ───────────────────────────────────────────────────────────
-- DB Spec §3: "Training roadmap linking a planned activity to an identified
-- skill or certification gap (FR-54)."
CREATE TABLE TRAINING_PLAN (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    StaffId             UUID NOT NULL REFERENCES STAFF(Id) ON DELETE CASCADE,
    SkillId             UUID REFERENCES SKILL(Id) ON DELETE SET NULL,
    CertificationId     UUID REFERENCES CERTIFICATION(Id) ON DELETE SET NULL,
    PlannedActivity     VARCHAR(200) NOT NULL,
    TargetDate          DATE,
    Status              VARCHAR(20) NOT NULL DEFAULT 'Planned',
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt           TIMESTAMPTZ,
    CONSTRAINT chk_trainingplan_status CHECK (Status IN ('Planned','InProgress','Completed','Cancelled')),
    -- API Spec POST /api/skills/training: exactly one of SkillId / CertificationId
    -- must be set, never both, never neither.
    CONSTRAINT chk_trainingplan_exactly_one_link CHECK (
        (SkillId IS NOT NULL AND CertificationId IS NULL) OR
        (SkillId IS NULL AND CertificationId IS NOT NULL)
    )
);
COMMENT ON TABLE TRAINING_PLAN IS 'PRD §7.15, §11 — training roadmap linking planned activity to a skill or certification gap (FR-54)';
