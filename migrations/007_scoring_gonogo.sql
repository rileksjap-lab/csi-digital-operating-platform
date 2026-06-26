-- ════════════════════════════════════════════════════════════════════════════
-- Migration 007: Tender Scoring & Go/No-Go Evaluation
-- Reference: Database Design Specification v1.0 §3.16–3.17
-- Tables: TENDER_SCORING, GONOGO_EVALUATION
-- Depends on: TENDER, BASELINE_TIER, STAFF
-- ════════════════════════════════════════════════════════════════════════════

-- ── TENDER_SCORING ──────────────────────────────────────────────────────────
-- DB Spec §3: "New-commitment scoring inputs and resulting size tier (PRD
-- §13.3, FR-37)."
CREATE TABLE TENDER_SCORING (
    Id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ReferenceNo             VARCHAR(30) NOT NULL,
    TenderId                UUID REFERENCES TENDER(Id) ON DELETE SET NULL,
    FunctionalBreadth       SMALLINT NOT NULL,
    IntegrationCount        SMALLINT NOT NULL,
    ComplianceDepth         SMALLINT NOT NULL,
    SolutionNovelty         SMALLINT NOT NULL,
    CommercialComplexity    SMALLINT NOT NULL,
    StakeholderIntensity    SMALLINT NOT NULL,
    IsRush                  BOOLEAN NOT NULL DEFAULT false,
    IsConsortium            BOOLEAN NOT NULL DEFAULT false,
    IsSecurityHeavy         BOOLEAN NOT NULL DEFAULT false,
    IsCustomDev              BOOLEAN NOT NULL DEFAULT false,
    IsManyQA                BOOLEAN NOT NULL DEFAULT false,
    IsOnsite                BOOLEAN NOT NULL DEFAULT false,
    WeightedScore           NUMERIC(5,2),
    BaselineTierId          UUID REFERENCES BASELINE_TIER(Id) ON DELETE RESTRICT,
    ScoredBy                UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    ScoredAt                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CreatedAt               TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt               TIMESTAMPTZ,
    CONSTRAINT uq_tenderscoring_referenceno UNIQUE (ReferenceNo),
    CONSTRAINT chk_tenderscoring_criteria CHECK (
        FunctionalBreadth BETWEEN 0 AND 5 AND
        IntegrationCount BETWEEN 0 AND 5 AND
        ComplianceDepth BETWEEN 0 AND 5 AND
        SolutionNovelty BETWEEN 0 AND 5 AND
        CommercialComplexity BETWEEN 0 AND 5 AND
        StakeholderIntensity BETWEEN 0 AND 5
    )
);
COMMENT ON TABLE TENDER_SCORING IS 'PRD §13.3, §11 — six-criterion scoring inputs and resulting size tier (FR-37)';
COMMENT ON COLUMN TENDER_SCORING.WeightedScore IS 'System-computed from the six criteria; not directly editable via the API (API Spec POST /api/tender/:id/score)';

CREATE INDEX idx_scoring_tender ON TENDER_SCORING(TenderId);

-- ── GONOGO_EVALUATION ───────────────────────────────────────────────────────
-- DB Spec §3: "Capacity projection and decision log for new commitments (PRD
-- §13.4, FR-39–40)."
CREATE TABLE GONOGO_EVALUATION (
    Id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ScoringId                   UUID NOT NULL REFERENCES TENDER_SCORING(Id) ON DELETE CASCADE,
    PlanningHorizonDays         SMALLINT NOT NULL DEFAULT 10,
    ProjectedCSIUtilization     NUMERIC(5,2),
    ProjectedCMTUtilization     NUMERIC(5,2),
    Recommendation              VARCHAR(10) NOT NULL,
    OverrideBy                  UUID REFERENCES STAFF(Id) ON DELETE RESTRICT,
    OverrideReason              TEXT,
    EvaluatedAt                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CreatedAt                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt                   TIMESTAMPTZ,
    CONSTRAINT uq_gonogo_scoringid UNIQUE (ScoringId),
    CONSTRAINT chk_gonogo_recommendation CHECK (Recommendation IN ('Go','NoGo')),
    CONSTRAINT chk_gonogo_horizon_positive CHECK (PlanningHorizonDays BETWEEN 1 AND 90),
    -- BR-06 / FR-40: an override is only meaningful — and only permitted — on a
    -- NoGo recommendation, and always requires a justification. The application
    -- layer (API Spec POST /api/tender/:id/gonogo/:goNoGoId/override) restricts
    -- this to the HOD role; this CHECK constraint is the database-level backstop
    -- ensuring OverrideBy is never set without OverrideReason, or vice versa.
    CONSTRAINT chk_gonogo_override_pair CHECK (
        (OverrideBy IS NULL AND OverrideReason IS NULL) OR
        (OverrideBy IS NOT NULL AND OverrideReason IS NOT NULL)
    )
);
COMMENT ON TABLE GONOGO_EVALUATION IS 'PRD §13.4, §11 — capacity projection and Go/No-Go decision log, 1:1 with TENDER_SCORING (FR-39–40)';
