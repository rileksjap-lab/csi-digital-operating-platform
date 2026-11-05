-- ════════════════════════════════════════════════════════════════════════════
-- CMP Transformation Management — Proposed Schema (DRAFT, NOT YET A MIGRATION)
-- ════════════════════════════════════════════════════════════════════════════
-- Status: PROPOSAL for review. This file is NOT numbered into /migrations and
-- must not be applied to any database until the user has reviewed and
-- approved the assessment + mapping package (see docs/cmp-transformation/).
--
-- Conventions match existing CSIDOP migrations (see apps/csidop/migrations/):
--   - UUID surrogate PKs via gen_random_uuid()
--   - CreatedBy/CreatedAt/UpdatedAt audit columns on every table
--   - CHECK constraints for enums, matching the STAFF/CSI_WO pattern
--   - Every table gets an entry in the existing hash-chained AUDIT_LOG via
--     the application layer, same as every other CSIDOP table — no new
--     audit infrastructure needed.
--
-- Decision log (resolved 2026-07-16, see docs/cmp-transformation/03_field_and_functional_mapping.md):
--   1. BIM tracking -> extends CSI_WO (no standalone table). See the
--      CSI_WO extension block below.
--   2. CMP KPIs -> kept fully separate from the existing operational KPI
--      module (CMP_KPI / CMP_KPI_TARGET / CMP_KPI_ACTUAL below).
--   3. CMP Actions -> standalone CMP_ACTION table (not a WO_TASK reuse).
--   4. Owner fields -> free-text OwnerRoleTitle throughout, not STAFF FKs.
--   5. Decision Log seed content -> deferred; user will finalize the list
--      before migration (do not auto-seed from Excel/MVP/deck).
-- ════════════════════════════════════════════════════════════════════════════


-- ─── Shared period lookup (replaces free-text "Y1 Q1" strings across sheets) ───
-- Reused by CMP_SCURVE_PERIOD, CMP_SHADOW_PNL_PERIOD, and CMP_MILESTONE's
-- PlannedPeriod — one canonical 21-row table instead of the fragile per-sheet
-- free text found in the source Excel (assessment finding, sheet 8/11).
CREATE TABLE CMP_PERIOD (
    Code            VARCHAR(10) PRIMARY KEY,   -- 'BASELINE', 'Y1Q1' ... 'Y5Q4'
    Label           VARCHAR(20) NOT NULL,       -- 'Baseline', 'Y1 Q1'
    YearNumber      SMALLINT,                   -- NULL for Baseline, else 1-5
    QuarterNumber   SMALLINT,                   -- NULL for Baseline, else 1-4
    SortOrder       SMALLINT NOT NULL UNIQUE,
    CONSTRAINT chk_cmpperiod_quarter CHECK (QuarterNumber IS NULL OR QuarterNumber BETWEEN 1 AND 4)
);
COMMENT ON TABLE CMP_PERIOD IS 'Fixed 21-row period enum (Baseline + Y1Q1..Y5Q4), shared across S-Curve, Shadow P&L and Milestone planned-period fields';

-- ─── CMP plan-level configuration (singleton today; assessment sheet 1/2) ───
CREATE TABLE CMP_PLAN (
    Id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    LatestReviewPeriod                 VARCHAR(50),
    DeckVersion                        VARCHAR(20),
    WorkbookVersion                    VARCHAR(20),
    BaselineRangeLabel                 VARCHAR(20),          -- '2026-2031'
    ApprovedBaselinePct                NUMERIC(5,4),
    ApprovedBaselineStatus             VARCHAR(20) NOT NULL DEFAULT 'Proposed',
    AnnualOperatingCost                NUMERIC(15,2),
    ExpectedGrossMarginPct             NUMERIC(5,4),
    FutureCompanyFixedCost             NUMERIC(15,2),
    FutureCompanyContributionMarginPct NUMERIC(5,4),
    FinanceValidationStatus            VARCHAR(30) NOT NULL DEFAULT 'PendingFinance',
    CreatedBy                          UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt                          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt                          TIMESTAMPTZ,
    CONSTRAINT chk_cmpplan_baselinestatus CHECK (ApprovedBaselineStatus IN ('Proposed','Approved')),
    CONSTRAINT chk_cmpplan_marginpct CHECK (ExpectedGrossMarginPct IS NULL OR ExpectedGrossMarginPct BETWEEN 0 AND 1),
    CONSTRAINT chk_cmpplan_contribmarginpct CHECK (FutureCompanyContributionMarginPct IS NULL OR FutureCompanyContributionMarginPct BETWEEN 0 AND 1)
);
COMMENT ON TABLE CMP_PLAN IS 'Single-row-per-department CMP configuration; the 4 Finance-owned break-even inputs currently blank pending Finance validation (assessment sheet 2)';

-- ─── Weighted scorecard categories (assessment sheet 1) ───
CREATE TABLE CMP_SCORECARD_CATEGORY (
    Id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId        UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    CategoryName  VARCHAR(100) NOT NULL,
    Weight        NUMERIC(5,4) NOT NULL,
    SortOrder     SMALLINT NOT NULL,
    -- PlannedPct/ActualPct/Variance are intentionally NOT stored — derived at
    -- read time from CMP_SCURVE_PERIOD (Baseline row) per plan. Source Excel
    -- hardcoded 2 of 6 rows independently of the S-Curve (assessment finding,
    -- sheet 1) — this constraint structurally prevents that drift.
    CONSTRAINT uq_cmpscorecat_name UNIQUE (PlanId, CategoryName)
);
COMMENT ON TABLE CMP_SCORECARD_CATEGORY IS 'The 6-perspective Balanced Scorecard weighting (assessment sheet 1 / deck slide 11); Planned%/Actual% always derived from CMP_SCURVE_PERIOD, never independently entered';
-- Application-layer check on write: SUM(Weight) WHERE PlanId = x MUST = 1.0

-- ─── S-Curve quarterly progress (assessment sheet 8) ───
CREATE TABLE CMP_SCURVE_PERIOD (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    PeriodCode      VARCHAR(10) NOT NULL REFERENCES CMP_PERIOD(Code) ON DELETE RESTRICT,
    PlannedPct      NUMERIC(5,4) NOT NULL,
    ActualPct       NUMERIC(5,4),               -- NULL until quarter closes; entered manually or (future) computed from weighted milestone completion per deck slide 14's stated formula
    ActualIsOverride BOOLEAN NOT NULL DEFAULT false, -- true if manually entered rather than system-computed; requires OverrideReason
    OverrideReason  TEXT,
    -- Draft/published mechanic (from design discussion, not in the source Excel):
    -- ActualPct recalculates live all quarter as milestone weights complete.
    -- PublishedAt/PublishedBy snapshot it as the official historical figure
    -- at the actual monthly/quarterly review — after publish, further
    -- CMP_MILESTONE changes affect only the *current* (next) draft period,
    -- never retroactively alter a published one. NULL PublishedAt = still draft.
    PublishedAt     TIMESTAMPTZ,
    PublishedBy     UUID REFERENCES STAFF(Id) ON DELETE SET NULL,
    StageLabel      VARCHAR(100),
    ReviewFocus     TEXT,
    ManagementAction TEXT,
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_cmpscurve_period UNIQUE (PlanId, PeriodCode),
    CONSTRAINT chk_cmpscurve_override CHECK ((ActualIsOverride = false) OR (OverrideReason IS NOT NULL)),
    CONSTRAINT chk_cmpscurve_published CHECK ((PublishedAt IS NULL) = (PublishedBy IS NULL))
);
COMMENT ON TABLE CMP_SCURVE_PERIOD IS 'Quarterly Planned vs Actual CMP transformation progress (assessment sheet 8); Variance and RAG are computed at read time, never stored; ActualPct is a live draft until PublishedAt locks it as the official quarterly figure';

-- ─── Milestones (assessment sheet 3) ───
CREATE TABLE CMP_MILESTONE (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    MilestoneCode   VARCHAR(20) NOT NULL,        -- auto-generated 'CMP-###', same pattern as CSI_WO_No
    Workstream      VARCHAR(50) NOT NULL,
    Title           VARCHAR(300) NOT NULL,
    PlannedPeriodCode VARCHAR(10) REFERENCES CMP_PERIOD(Code) ON DELETE RESTRICT,
    OwnerRoleTitle  VARCHAR(100) NOT NULL,        -- free text ("HOD CSI / Finance") — decision #4: role, not a STAFF FK
    Status          VARCHAR(20) NOT NULL DEFAULT 'NotStarted',
    Weight          NUMERIC(5,4),                 -- feeds the S-Curve "weighted milestone completion" formula (deck slide 14)
    EvidenceLink    TEXT,
    Remarks         TEXT,
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_cmpmilestone_code UNIQUE (MilestoneCode),
    CONSTRAINT chk_cmpmilestone_status CHECK (Status IN ('NotStarted','Planned','InProgress','Completed'))
);
COMMENT ON TABLE CMP_MILESTONE IS 'Transformation milestone register (assessment sheet 3); RAG computed from Status, not stored (fixes Status/RAG mismatch found in source Excel)';

-- ─── Actions (assessment sheet 4) — decision #3: standalone table, confirmed ───
CREATE TABLE CMP_ACTION (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    MilestoneId     UUID REFERENCES CMP_MILESTONE(Id) ON DELETE SET NULL,
    Description     TEXT NOT NULL,
    OwnerRoleTitle  VARCHAR(100) NOT NULL,
    DueDate         DATE,
    Priority        VARCHAR(10) NOT NULL DEFAULT 'Normal',
    Status          VARCHAR(20) NOT NULL DEFAULT 'Open',
    Dependency      TEXT,
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT chk_cmpaction_priority CHECK (Priority IN ('Low','Normal','High','Urgent'))
);
COMMENT ON TABLE CMP_ACTION IS 'Monthly follow-up action log (assessment sheet 4); kept as its own table rather than reusing the WO task-checklist pattern (decision #3)';

-- ─── Decisions (assessment sheet 5 + deck slide 29) ───
CREATE TABLE CMP_DECISION (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    DecisionText    TEXT NOT NULL,
    OwnerRoleTitle  VARCHAR(100) NOT NULL,
    TargetReview    VARCHAR(20),
    Status          VARCHAR(20) NOT NULL DEFAULT 'Pending',
    DecisionDate    DATE,
    Outcome         TEXT,
    Remarks         TEXT,
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_cmpdecision_status CHECK (Status IN ('Pending','Decided')),
    CONSTRAINT chk_cmpdecision_dateoutcome CHECK (
        (Status = 'Pending') OR (DecisionDate IS NOT NULL AND Outcome IS NOT NULL)
    )
);
COMMENT ON TABLE CMP_DECISION IS 'Management decision log (assessment sheet 5); paired DecisionDate+Outcome required together, same pattern as GONOGO_EVALUATION override rule. Seed content deferred (decision #5) — user will finalize the decision list before migration, do not auto-seed from Excel (3), MVP sample (6) or deck (10), which disagree on count';

-- ─── Issues (assessment sheet 6) ───
CREATE TABLE CMP_ISSUE (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId              UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    DateRaised          DATE NOT NULL DEFAULT CURRENT_DATE,
    Description         TEXT NOT NULL,
    Category            VARCHAR(50) NOT NULL,
    Impact              TEXT,
    OwnerRoleTitle       VARCHAR(100) NOT NULL,
    TargetResolution    DATE,
    Status              VARCHAR(20) NOT NULL DEFAULT 'Open',
    EscalationRequired  BOOLEAN NOT NULL DEFAULT false,
    CreatedBy           UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE CMP_ISSUE IS 'Current blockers/problems (assessment sheet 6); EscalationRequired=true forces Executive Dashboard visibility per deck slide 28 red-risk rule';

-- ─── Risk register (assessment sheet 7) ───
CREATE TABLE CMP_RISK (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    RiskCode        VARCHAR(20) NOT NULL,        -- auto-generated 'R-###'
    Category        VARCHAR(50) NOT NULL,
    Description     TEXT NOT NULL,
    Impact          SMALLINT NOT NULL,
    Likelihood      SMALLINT NOT NULL,
    RiskScore       SMALLINT GENERATED ALWAYS AS (Impact * Likelihood) STORED,
    OwnerRoleTitle  VARCHAR(100) NOT NULL,
    MitigationPlan  TEXT NOT NULL,
    DueDate         DATE,
    Status          VARCHAR(20) NOT NULL DEFAULT 'Open',
    RagStatus       VARCHAR(10) NOT NULL DEFAULT 'Red', -- genuine editable judgement here, unlike every other RAG in this schema (assessment sheet 7 finding)
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_cmprisk_code UNIQUE (RiskCode),
    CONSTRAINT chk_cmprisk_impact CHECK (Impact BETWEEN 1 AND 5),
    CONSTRAINT chk_cmprisk_likelihood CHECK (Likelihood BETWEEN 1 AND 5),
    CONSTRAINT chk_cmprisk_rag CHECK (RagStatus IN ('Green','Amber','Red'))
);
COMMENT ON TABLE CMP_RISK IS 'Risk register with Impact x Likelihood scoring (assessment sheet 7); RiskRating (High/Medium/Low) derived from RiskScore at read time';

-- ─── Shadow P&L (assessment sheet 11) ───
CREATE TABLE CMP_SHADOW_PNL_PERIOD (
    Id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId                  UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    PeriodCode              VARCHAR(10) NOT NULL REFERENCES CMP_PERIOD(Code) ON DELETE RESTRICT,
    TenderRevenueAttribution NUMERIC(15,2),
    AdvisoryRevenue          NUMERIC(15,2),
    BimRevenue                NUMERIC(15,2),
    CostOptimisationValue    NUMERIC(15,2),
    MarginProtectionValue     NUMERIC(15,2),
    ManpowerCost              NUMERIC(15,2),
    ToolsSoftwareCost         NUMERIC(15,2),
    TrainingCertCost          NUMERIC(15,2),
    PartnerConsultantCost     NUMERIC(15,2),
    OperatingOverheadCost     NUMERIC(15,2),
    CreatedBy                UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    UpdatedAt                 TIMESTAMPTZ,
    CONSTRAINT uq_cmpshadowpnl_period UNIQUE (PlanId, PeriodCode)
);
COMMENT ON TABLE CMP_SHADOW_PNL_PERIOD IS 'Quarterly shadow P&L (assessment sheet 11); TotalValue/TotalCost/NetContribution/RAG computed at read time and MUST return NULL/"TBD" (not 0/"Green") when all inputs are null — fixes a real bug in the source Excel where SUM() over blank cells silently evaluated to a false-positive Green status';

-- ─── Business pillars (assessment sheet 12, absorbs pillar rows of sheet 10) ───
CREATE TABLE CMP_BUSINESS_PILLAR (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    PillarName      VARCHAR(100) NOT NULL,
    OwnerRoleTitle  VARCHAR(100) NOT NULL,
    RevenueDriver   TEXT,
    CostDriver      TEXT,
    AnnualCost      NUMERIC(15,2),
    TargetMarginPct NUMERIC(5,4),
    ActualRevenue   NUMERIC(15,2),
    ProfitPotential VARCHAR(30),
    MaturityStage   VARCHAR(30),
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_cmppillar_name UNIQUE (PlanId, PillarName),
    CONSTRAINT chk_cmppillar_marginpct CHECK (TargetMarginPct IS NULL OR TargetMarginPct BETWEEN 0 AND 1)
);
COMMENT ON TABLE CMP_BUSINESS_PILLAR IS 'The 5 CSI commercial pillars as mini-businesses (assessment sheet 12); single source of truth for pillar break-even, replacing the duplicated pillar rows in the source Excel''s BreakEven_Master tab';

-- ─── Break-even views: Department, Future Company, Payback controls only ───
-- (pillar break-even lives on CMP_BUSINESS_PILLAR above, not duplicated here)
CREATE TABLE CMP_BREAKEVEN_VIEW (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    ViewType        VARCHAR(30) NOT NULL,
    AnnualCost      NUMERIC(15,2),
    MarginPct       NUMERIC(5,4),
    ActualRevenue   NUMERIC(15,2),
    OwnerRoleTitle  VARCHAR(100),
    FormulaMethod   TEXT,
    Notes           TEXT,
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_cmpbreakeven_viewtype UNIQUE (PlanId, ViewType),
    CONSTRAINT chk_cmpbreakeven_viewtype CHECK (ViewType IN ('DepartmentProfitCentre','FutureCompanyEntity','PlatformPayback','TrainingPayback')),
    CONSTRAINT chk_cmpbreakeven_marginpct CHECK (MarginPct IS NULL OR MarginPct BETWEEN 0 AND 1)
);
COMMENT ON TABLE CMP_BREAKEVEN_VIEW IS 'Department, Future Company and payback break-even views (assessment sheet 10); BreakEvenRevenue/Progress%/Status computed at read time, returning NULL not the Excel''s "TBD" string';

-- ─── Service catalogue (assessment sheet 13) ───
CREATE TABLE CMP_SERVICE_CATALOGUE_ITEM (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PillarId        UUID NOT NULL REFERENCES CMP_BUSINESS_PILLAR(Id) ON DELETE CASCADE,
    OfferingName    VARCHAR(200) NOT NULL,
    PricingLogic    TEXT,
    TargetCustomer  TEXT,
    Status          VARCHAR(20) NOT NULL DEFAULT 'Draft',
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_cmpservice_status CHECK (Status IN ('Draft','Approved','Retired'))
);
COMMENT ON TABLE CMP_SERVICE_CATALOGUE_ITEM IS 'Commercial service offerings per pillar (assessment sheet 13); many-to-one with pillar, expandable beyond the 5 seed rows per deck slides 9/10/25';

-- ─── BIM tracking (assessment sheet 14) — decision #1: extend CSI_WO ───
-- No standalone table. BIM delivery already flows through Work Orders today;
-- these columns let a WO be tagged against a CMP pillar (generically useful,
-- not BIM-only) and carry the QA/QC + revenue-attribution fields the source
-- Excel's BIM_Tracker sheet asked for. Nullable throughout — irrelevant for
-- the vast majority of WOs that have nothing to do with CMP.
ALTER TABLE CSI_WO ADD COLUMN CmpPillarId UUID REFERENCES CMP_BUSINESS_PILLAR(Id) ON DELETE SET NULL;
ALTER TABLE CSI_WO ADD COLUMN CmpQaQcStatus VARCHAR(30);
ALTER TABLE CSI_WO ADD COLUMN CmpRevenueAttributed NUMERIC(15,2);
COMMENT ON COLUMN CSI_WO.CmpPillarId IS 'Tags this WO as contributing to a CMP business pillar (assessment sheet 14 decision: BIM tracking extends CSI_WO rather than a standalone table); NULL for ordinary WOs unrelated to CMP';
COMMENT ON COLUMN CSI_WO.CmpQaQcStatus IS 'BIM/delivery QA-QC status for CMP-pillar-tagged WOs only; NULL when CmpPillarId is NULL';
COMMENT ON COLUMN CSI_WO.CmpRevenueAttributed IS 'Revenue attributed to the tagged CMP pillar for this WO, feeding CMP_BUSINESS_PILLAR.ActualRevenue and CMP_SHADOW_PNL_PERIOD roll-ups';

-- ─── Resource plan (assessment sheet 15) ───
CREATE TABLE CMP_RESOURCE_PLAN_ITEM (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    YearLabel       VARCHAR(20) NOT NULL,
    ResourceFocus   VARCHAR(200) NOT NULL,
    KeyAdditions    TEXT,
    ResourceLayer   VARCHAR(50),
    TriggerGate     TEXT,
    OwnerRoleTitle  VARCHAR(100) NOT NULL,
    Status          VARCHAR(20) NOT NULL DEFAULT 'Planned',
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CONSTRAINT uq_cmpresourceplan_year UNIQUE (PlanId, YearLabel)
);
COMMENT ON TABLE CMP_RESOURCE_PLAN_ITEM IS 'Phased resourcing plan by year (assessment sheet 15); complements but does not replace the existing Capacity module (different grain — planned future headcount vs current utilisation)';

-- ─── Training & certification roadmap (assessment sheet 16, deck-sourced) ───
CREATE TABLE CMP_TRAINING_TRACK (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    TrackName       VARCHAR(100) NOT NULL,
    OwnerRoleTitle  VARCHAR(100) NOT NULL,
    BudgetStatus    VARCHAR(30) NOT NULL DEFAULT 'TBD',
    CONSTRAINT uq_cmptrainingtrack_name UNIQUE (PlanId, TrackName)
);
CREATE TABLE CMP_TRAINING_MILESTONE (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    TrackId         UUID NOT NULL REFERENCES CMP_TRAINING_TRACK(Id) ON DELETE CASCADE,
    YearStage       VARCHAR(20) NOT NULL,        -- 'Y1 Foundation' ... 'Y5 Company-Ready'
    MilestoneText   TEXT NOT NULL,                -- specific cert/skill target, sourced from deck slides 21/27 (richer than Excel)
    SortOrder       SMALLINT NOT NULL,
    CONSTRAINT uq_cmptrainingmilestone_stage UNIQUE (TrackId, YearStage)
);
COMMENT ON TABLE CMP_TRAINING_TRACK IS 'Capability tracks (assessment sheet 16); content should be seeded from the slide deck (slides 21/27), which is materially more detailed than the Excel tab of the same name';
COMMENT ON TABLE CMP_TRAINING_MILESTONE IS 'Normalizes the wide Y1..Y5 columns of the source Excel into one row per track per stage; distinct from the existing Skills module which tracks individual staff certifications, not department-level planning';

-- ─── Company readiness gate (assessment sheet 17) ───
CREATE TABLE CMP_READINESS_AREA (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    AreaName        VARCHAR(50) NOT NULL,
    GateCriteria    TEXT NOT NULL,
    Weight          NUMERIC(5,4) NOT NULL,
    CurrentActual   NUMERIC(5,4),
    TargetPct       NUMERIC(5,4) NOT NULL,
    EvidenceAction  TEXT,
    OwnerRoleTitle  VARCHAR(100) NOT NULL,
    CONSTRAINT uq_cmpreadiness_area UNIQUE (PlanId, AreaName)
);
COMMENT ON TABLE CMP_READINESS_AREA IS 'Company-readiness gate, 8 weighted areas (assessment sheet 17); Platform Readiness CurrentActual should be computed from platform build status, not independently maintained — closes the 3-way duplication found across sheets 17/21 and milestone CMP-006';
-- Application-layer check on write: SUM(Weight) WHERE PlanId = x MUST = 1.0

-- ─── KPI scorecard (assessment sheet 9, normalized wide-to-long) ───
CREATE TABLE CMP_KPI (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    Name            VARCHAR(150) NOT NULL,
    Perspective     VARCHAR(50) NOT NULL,
    Weight          NUMERIC(5,4) NOT NULL,
    Evidence        TEXT,
    CONSTRAINT uq_cmpkpi_name UNIQUE (PlanId, Name)
);
CREATE TABLE CMP_KPI_TARGET (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    KpiId               UUID NOT NULL REFERENCES CMP_KPI(Id) ON DELETE CASCADE,
    PeriodLabel         VARCHAR(20) NOT NULL,     -- 'Baseline','Y1','Y2','Y3','Y5' (coarser than the 21-period S-Curve enum, matches this sheet's own granularity)
    TargetValueNumeric  NUMERIC(6,4),
    TargetValueText     VARCHAR(50),
    CONSTRAINT uq_cmpkpitarget_period UNIQUE (KpiId, PeriodLabel),
    CONSTRAINT chk_cmpkpitarget_exactlyone CHECK (
        (TargetValueNumeric IS NOT NULL AND TargetValueText IS NULL) OR
        (TargetValueNumeric IS NULL AND TargetValueText IS NOT NULL)
    )
);
CREATE TABLE CMP_KPI_ACTUAL (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    KpiId           UUID NOT NULL REFERENCES CMP_KPI(Id) ON DELETE CASCADE,
    PeriodCode      VARCHAR(10) NOT NULL REFERENCES CMP_PERIOD(Code) ON DELETE RESTRICT,
    ActualValue     NUMERIC(15,4),
    RecordedBy      UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    RecordedAt      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cmpkpiactual_period UNIQUE (KpiId, PeriodCode)
);
COMMENT ON TABLE CMP_KPI IS '11 balanced-scorecard KPIs (assessment sheet 9); kept fully separate from the existing operational KPI module (decision #2) — different scoring model, audience and cadence';
COMMENT ON TABLE CMP_KPI_TARGET IS 'Normalizes wide Baseline/Y1/Y2/Y3/Y5 target columns into rows; TargetValueNumeric xor TargetValueText handles the mixed numeric/maturity-stage targets found in the source (e.g. "Not measured", "Full P&L")';
COMMENT ON TABLE CMP_KPI_ACTUAL IS 'Quarterly/periodic actual values entered going forward; only 1 of 11 KPIs has a real actual today (CMP Achievement Score, sourced from CMP_SCURVE_PERIOD)';

-- ─── Meeting minutes + junction tables (assessment sheet 19) ───
CREATE TABLE CMP_MEETING_MINUTES (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    MeetingDate     DATE NOT NULL,
    MeetingType     VARCHAR(50) NOT NULL,
    Attendees       TEXT,
    KeyUpdates      TEXT,
    NextReview      DATE,
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE CMP_MEETING_DECISION_LINK (
    MeetingId   UUID NOT NULL REFERENCES CMP_MEETING_MINUTES(Id) ON DELETE CASCADE,
    DecisionId  UUID NOT NULL REFERENCES CMP_DECISION(Id) ON DELETE CASCADE,
    PRIMARY KEY (MeetingId, DecisionId)
);
CREATE TABLE CMP_MEETING_RISK_LINK (
    MeetingId   UUID NOT NULL REFERENCES CMP_MEETING_MINUTES(Id) ON DELETE CASCADE,
    RiskId      UUID NOT NULL REFERENCES CMP_RISK(Id) ON DELETE CASCADE,
    PRIMARY KEY (MeetingId, RiskId)
);
CREATE TABLE CMP_MEETING_ACTION_LINK (
    MeetingId   UUID NOT NULL REFERENCES CMP_MEETING_MINUTES(Id) ON DELETE CASCADE,
    ActionId    UUID NOT NULL REFERENCES CMP_ACTION(Id) ON DELETE CASCADE,
    PRIMARY KEY (MeetingId, ActionId)
);
COMMENT ON TABLE CMP_MEETING_MINUTES IS 'Monthly/quarterly CMP review record (assessment sheet 19); links to Decision/Risk/Action replace the source Excel''s free-text columns of the same purpose';

-- ─── Public read-only share link (from design discussion, not in source Excel) ───
-- Two-tier access model: (a) in-app, every authenticated CSIDOP role can see
-- the CMP Executive subset cross-department, same as any other module; (b)
-- this table backs the *unauthenticated* fallback for people with no CSIDOP
-- account at all (Chairman/board). This is the first unauthenticated route
-- in the app — Token must never be guessable, is revocable/regenerable by
-- HOD CSI/Admin, and only ever grants read access to a fixed Executive
-- subset (Dashboard, S-Curve, KPI Scorecard, Readiness Gate) — routes serving
-- this token must be structurally incapable of returning Risk mitigation
-- text, Decision remarks, or financial line items.
CREATE TABLE CMP_PUBLIC_SHARE_LINK (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    Token           VARCHAR(64) NOT NULL,          -- long random token, generated application-side (not user-chosen)
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    RevokedAt       TIMESTAMPTZ,
    RevokedBy       UUID REFERENCES STAFF(Id) ON DELETE SET NULL,
    CONSTRAINT uq_cmpsharelink_token UNIQUE (Token),
    CONSTRAINT chk_cmpsharelink_revoked CHECK ((RevokedAt IS NULL) = (RevokedBy IS NULL))
);
CREATE TABLE CMP_PUBLIC_SHARE_ACCESS_LOG (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ShareLinkId     UUID NOT NULL REFERENCES CMP_PUBLIC_SHARE_LINK(Id) ON DELETE CASCADE,
    AccessedAt      TIMESTAMPTZ NOT NULL DEFAULT now(),
    IpAddress       VARCHAR(45),
    UserAgent       TEXT
);
COMMENT ON TABLE CMP_PUBLIC_SHARE_LINK IS 'Backs the unauthenticated public read-only view for CMP viewers with no CSIDOP account; only ever exposes the Executive subset, never edit endpoints';
COMMENT ON TABLE CMP_PUBLIC_SHARE_ACCESS_LOG IS 'Access log for the public share link — anonymous viewers cannot be identified, but every access is still recorded (IP/timestamp), consistent with the audit-everything principle applied elsewhere in CSIDOP';

-- ─── Import batches — cross-cutting, supports deliverables 7-10 ───
CREATE TABLE CMP_IMPORT_BATCH (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    PlanId          UUID NOT NULL REFERENCES CMP_PLAN(Id) ON DELETE CASCADE,
    SourceFileName  VARCHAR(255) NOT NULL,
    SourceSheet     VARCHAR(100) NOT NULL,
    TargetTable     VARCHAR(100) NOT NULL,
    Status          VARCHAR(20) NOT NULL DEFAULT 'Staged',
    TotalRows       INTEGER NOT NULL DEFAULT 0,
    ValidRows       INTEGER NOT NULL DEFAULT 0,
    ErrorRows       INTEGER NOT NULL DEFAULT 0,
    ImportedBy      UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    ImportedAt      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CommittedAt     TIMESTAMPTZ,
    CONSTRAINT chk_cmpimportbatch_status CHECK (Status IN ('Staged','Validated','Committed','Rejected'))
);
CREATE TABLE CMP_IMPORT_BATCH_ROW (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    BatchId         UUID NOT NULL REFERENCES CMP_IMPORT_BATCH(Id) ON DELETE CASCADE,
    RowNumber       INTEGER NOT NULL,
    RawData         JSONB NOT NULL,
    ValidationErrors JSONB,
    TargetRecordId  UUID,                          -- populated once committed
    Status          VARCHAR(20) NOT NULL DEFAULT 'Pending',
    CONSTRAINT chk_cmpimportrow_status CHECK (Status IN ('Pending','Valid','Invalid','Committed','Skipped'))
);
COMMENT ON TABLE CMP_IMPORT_BATCH IS 'Staging record for Excel imports (deliverables 7-9: import design, validation, migration); every import is staged and validated before committing to live CMP tables, never a direct overwrite';
COMMENT ON TABLE CMP_IMPORT_BATCH_ROW IS 'Row-level staging with validation errors and audit trail back to source row number, supporting the reconciliation deliverable (10)';

-- Indexes (representative — full index list to be finalised alongside deliverables 6-7)
CREATE INDEX idx_cmpmilestone_planid ON CMP_MILESTONE(PlanId);
CREATE INDEX idx_cmpmilestone_status ON CMP_MILESTONE(Status);
CREATE INDEX idx_cmprisk_planid ON CMP_RISK(PlanId);
CREATE INDEX idx_cmpscurve_planid ON CMP_SCURVE_PERIOD(PlanId);
CREATE INDEX idx_cmpkpiactual_kpiid ON CMP_KPI_ACTUAL(KpiId);
CREATE INDEX idx_cmpimportbatch_planid ON CMP_IMPORT_BATCH(PlanId);
CREATE INDEX idx_cmpimportbatchrow_batchid ON CMP_IMPORT_BATCH_ROW(BatchId);
CREATE INDEX idx_csiwo_cmppillarid ON CSI_WO(CmpPillarId) WHERE CmpPillarId IS NOT NULL;
CREATE INDEX idx_cmpsharelink_planid ON CMP_PUBLIC_SHARE_LINK(PlanId);
CREATE INDEX idx_cmpsharelog_sharelinkid ON CMP_PUBLIC_SHARE_ACCESS_LOG(ShareLinkId);
