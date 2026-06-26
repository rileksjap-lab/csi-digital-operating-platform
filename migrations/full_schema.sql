-- ════════════════════════════════════════════════════════════════════════════
-- CSI Digital Operating Platform — Consolidated Full Schema
-- Auto-concatenated from migrations 001–013 + seed scripts, in run order.
-- This file is a convenience reference for reviewing the complete schema in
-- one place. For actual deployment, run the numbered files individually via
-- run_all.sh, which provides per-file error isolation that this single
-- concatenated file does not.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- Migration 001: Extensions
-- CSI Digital Operating Platform — Database Migrations
-- Reference: Database Design Specification v1.0 §1.3 (Data Type Conventions)
-- ════════════════════════════════════════════════════════════════════════════

-- pgcrypto: provides gen_random_uuid() for surrogate UUID primary keys (DB Spec §1.4)
-- and the digest()/SHA-256 functions used by the AUDIT_LOG hash chain (DB Spec §6.3).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgAudit: statement-level audit logging at the PostgreSQL engine level,
-- catching any direct database access that bypasses the application layer
-- (DB Spec §7, SAD §9). This satisfies the MAMPU/KRISA audit requirement
-- as a defence-in-depth layer beneath the application-level AUDIT_LOG table.
-- NOTE: pgAudit requires the extension package to be installed on the server
-- (postgresql-16-pgaudit on Debian/Ubuntu) and shared_preload_libraries='pgaudit'
-- set in postgresql.conf, which requires a server restart. This statement is
-- included for completeness; if the extension package is not present on a given
-- environment, comment this line out and configure pgAudit at the infrastructure
-- provisioning stage instead (see SAD §14, Deployment Architecture).
-- CREATE EXTENSION IF NOT EXISTS pgaudit;
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 002: Lookup & Master Data Tables
-- Reference: Database Design Specification v1.0 §3 (Entity Data Dictionary)
-- Tables: DEPARTMENT, ROLE, REQUEST_TYPE, BASELINE_TIER, MULTIPLIER_FACTOR,
--         SYSTEM_SETTING
-- These tables have no foreign-key dependency on any other custom table and
-- must be created first. COMPLEXITY_TIER is created in migration 003 because
-- it depends on ROLE (ApproverRoleId).
-- ════════════════════════════════════════════════════════════════════════════

-- ── DEPARTMENT ──────────────────────────────────────────────────────────────
-- DB Spec §3: "CSI, CMT, CPO, CGI, CSA, CBA — mirrors the source / destination
-- department values already in CSI's tracker"
CREATE TABLE DEPARTMENT (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    DeptCode    VARCHAR(10)  NOT NULL,
    DeptName    VARCHAR(100) NOT NULL,
    CreatedAt   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UpdatedAt   TIMESTAMPTZ,
    CONSTRAINT uq_department_deptcode UNIQUE (DeptCode)
);
COMMENT ON TABLE DEPARTMENT IS 'Reference table for departments the platform is aware of (DB Spec §3)';

-- ── ROLE ────────────────────────────────────────────────────────────────────
-- DB Spec §3: "HOD, Solution Manager, Team Lead, Team Member, BIM Team Lead, BIM Modeler"
CREATE TABLE ROLE (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    RoleCode        VARCHAR(20) NOT NULL,
    RoleName        VARCHAR(50) NOT NULL,
    CapacityScope   VARCHAR(20) NOT NULL DEFAULT 'Self',
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_role_rolecode UNIQUE (RoleCode),
    CONSTRAINT chk_role_capacityscope CHECK (CapacityScope IN ('Department','Stream','Pod','Self'))
);
COMMENT ON TABLE ROLE IS 'The six system roles defined in PRD §6, with capacity scope used for row-level visibility (SAD §5)';

-- ── REQUEST_TYPE ────────────────────────────────────────────────────────────
-- DB Spec §3: "The 12-type request taxonomy from PRD §4.1, with the SLA targets each type carries"
CREATE TABLE REQUEST_TYPE (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    TypeCode            SMALLINT NOT NULL,
    TypeName            VARCHAR(80) NOT NULL,
    Domain              VARCHAR(50) NOT NULL,
    SlaAckDays          SMALLINT NOT NULL DEFAULT 1,
    SlaClassifyDays     SMALLINT NOT NULL DEFAULT 2,
    SlaRouteDays        SMALLINT NOT NULL DEFAULT 3,
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt           TIMESTAMPTZ,
    CONSTRAINT uq_requesttype_typecode UNIQUE (TypeCode),
    CONSTRAINT chk_requesttype_typecode CHECK (TypeCode BETWEEN 1 AND 12),
    CONSTRAINT chk_requesttype_domain CHECK (Domain IN ('Solution Design','Consultancy','BIM','Project Monitoring')),
    CONSTRAINT chk_requesttype_sla_positive CHECK (SlaAckDays >= 1 AND SlaClassifyDays >= 1 AND SlaRouteDays >= 1)
);
COMMENT ON TABLE REQUEST_TYPE IS 'PRD §4.1 — 12-type request taxonomy with configurable SLA targets (FR-32)';

-- ── BASELINE_TIER ───────────────────────────────────────────────────────────
-- DB Spec §3: "Baseline hour allocation per tender size tier (PRD §13.3)"
CREATE TABLE BASELINE_TIER (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    TierSize            VARCHAR(10) NOT NULL,
    BaselineCSIHours    NUMERIC(8,2) NOT NULL,
    BaselineCMTHours    NUMERIC(8,2) NOT NULL,
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt           TIMESTAMPTZ,
    CONSTRAINT uq_baselinetier_tiersize UNIQUE (TierSize),
    CONSTRAINT chk_baselinetier_size CHECK (TierSize IN ('Small','Medium','Large','Mega')),
    CONSTRAINT chk_baselinetier_hours_nonneg CHECK (BaselineCSIHours >= 0 AND BaselineCMTHours >= 0)
);
COMMENT ON TABLE BASELINE_TIER IS 'PRD §13.3 — baseline CSI/CMT hour allocation per tender size tier';

-- ── MULTIPLIER_FACTOR ───────────────────────────────────────────────────────
-- DB Spec §3: "Configurable multiplier values for the six complexity flags (FR-38)"
CREATE TABLE MULTIPLIER_FACTOR (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    FactorCode      VARCHAR(30) NOT NULL,
    MultiplierValue NUMERIC(4,2) NOT NULL,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_multiplierfactor_code UNIQUE (FactorCode),
    CONSTRAINT chk_multiplierfactor_code CHECK (FactorCode IN
        ('Rush','Consortium','SecurityHeavy','CustomDev','ManyQA','Onsite')),
    CONSTRAINT chk_multiplierfactor_positive CHECK (MultiplierValue > 0)
);
COMMENT ON TABLE MULTIPLIER_FACTOR IS 'FR-38 — the six complexity-multiplier values applied to baseline tender hours';

-- ── SYSTEM_SETTING ──────────────────────────────────────────────────────────
-- DB Spec §3: "Generic key-value configuration ... utilization thresholds, the
-- certification expiry window, the Go/No-Go default planning horizon, and similar"
CREATE TABLE SYSTEM_SETTING (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    SettingKey      VARCHAR(60) NOT NULL,
    SettingValue    VARCHAR(200) NOT NULL,
    Description     VARCHAR(300),
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_systemsetting_key UNIQUE (SettingKey)
);
COMMENT ON TABLE SYSTEM_SETTING IS 'FR-47–49 — generic configuration store for thresholds and windows not covered by a dedicated table';
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 003: Complexity Tier & Staff
-- Reference: Database Design Specification v1.0 §3
-- Tables: COMPLEXITY_TIER, STAFF
-- Depends on: ROLE, DEPARTMENT (migration 002)
-- ════════════════════════════════════════════════════════════════════════════

-- ── COMPLEXITY_TIER ─────────────────────────────────────────────────────────
-- DB Spec §3: "The three complexity tiers and the approver role each routes to (FR-33)"
CREATE TABLE COMPLEXITY_TIER (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    TierCode        SMALLINT NOT NULL,
    TierName        VARCHAR(30) NOT NULL,
    ApproverRoleId  UUID NOT NULL REFERENCES ROLE(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_complexitytier_tiercode UNIQUE (TierCode),
    CONSTRAINT chk_complexitytier_code CHECK (TierCode IN (1,2,3))
);
COMMENT ON TABLE COMPLEXITY_TIER IS 'FR-33 — three complexity tiers and the approval routing each implies';
CREATE INDEX idx_complexitytier_approverrole ON COMPLEXITY_TIER(ApproverRoleId);

-- ── STAFF ───────────────────────────────────────────────────────────────────
-- DB Spec §3: "Every CSI and CMT staff member known to the platform. Referenced
-- by foreign key from the majority of other tables — rows here are never
-- hard-deleted (DB Spec §1.4); deactivation uses the Status column."
CREATE TABLE STAFF (
    Id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    StaffCode           VARCHAR(20) NOT NULL,
    Name                VARCHAR(150) NOT NULL,
    Email               VARCHAR(150) NOT NULL,
    RoleId              UUID NOT NULL REFERENCES ROLE(Id) ON DELETE RESTRICT,
    DeptId              UUID NOT NULL REFERENCES DEPARTMENT(Id) ON DELETE RESTRICT,
    SubTeam             VARCHAR(20),
    ProductivityFactor  NUMERIC(3,2) NOT NULL DEFAULT 0.80,
    DailyUsableHours    NUMERIC(4,2) NOT NULL DEFAULT 6.40,
    Status              VARCHAR(20) NOT NULL DEFAULT 'Active',
    SystemConfigFlag    BOOLEAN NOT NULL DEFAULT false,
    CreatedAt           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt           TIMESTAMPTZ,
    CONSTRAINT uq_staff_staffcode UNIQUE (StaffCode),
    CONSTRAINT uq_staff_email UNIQUE (Email),
    CONSTRAINT chk_staff_subteam CHECK (SubTeam IS NULL OR SubTeam IN ('A','B','C','D')),
    CONSTRAINT chk_staff_productivityfactor CHECK (ProductivityFactor > 0 AND ProductivityFactor <= 1),
    CONSTRAINT chk_staff_dailyusablehours CHECK (DailyUsableHours > 0),
    CONSTRAINT chk_staff_status CHECK (Status IN ('Active','Inactive','OnLeave'))
);
COMMENT ON TABLE STAFF IS 'PRD §11 — staff register; rows are never hard-deleted (DB Spec §1.4), see migration 014 for the deactivation trigger note';
COMMENT ON COLUMN STAFF.DailyUsableHours IS 'PRD §13.1: WorkingHoursPerDay × ProductivityFactor. Maintained by the application layer on insert/update of ProductivityFactor; not a generated column, to allow WorkingHoursPerDay to vary by SYSTEM_SETTING in future without a schema change.';

-- Indexes supporting Wireframe Spec filters (DB Spec §5)
CREATE INDEX idx_staff_role_dept ON STAFF(RoleId, DeptId);
CREATE INDEX idx_staff_status ON STAFF(Status) WHERE Status = 'Active';
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 004: External Work Order & Tender
-- Reference: Database Design Specification v1.0 §3
-- Tables: EXTERNAL_WO, TENDER
-- Depends on: DEPARTMENT, STAFF (migrations 002–003)
-- ════════════════════════════════════════════════════════════════════════════

-- ── EXTERNAL_WO ─────────────────────────────────────────────────────────────
-- DB Spec §3: "The corporate-system reference record; system of record for
-- external intake." This table is seed data mirrored from the corporate
-- Work Order/EWM system (SAD §11, Phase 4 integration); in Phase 1–3 it is
-- populated manually at WO creation time (PRD FR-01).
CREATE TABLE EXTERNAL_WO (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ExtWO_No        VARCHAR(30) NOT NULL,
    ProjectCode     VARCHAR(30),
    SourceDeptId    UUID NOT NULL REFERENCES DEPARTMENT(Id) ON DELETE RESTRICT,
    EndUser         VARCHAR(150),
    ReceivedDate    DATE NOT NULL,
    Status          VARCHAR(20) NOT NULL DEFAULT 'Open',
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_externalwo_extwono UNIQUE (ExtWO_No)
);
COMMENT ON TABLE EXTERNAL_WO IS 'PRD §11 — external corporate WO reference; seed record for CSI_WO (FR-01)';
CREATE INDEX idx_externalwo_sourcedept ON EXTERNAL_WO(SourceDeptId);

-- ── TENDER ──────────────────────────────────────────────────────────────────
-- DB Spec §3: "The v1.1 top-level business object (PRD §4.3). Sits above
-- CSI_WO in the Tender → WO → Task → Effort hierarchy."
CREATE TABLE TENDER (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    TenderNo        VARCHAR(30) NOT NULL,
    TenderName      VARCHAR(200) NOT NULL,
    Client          VARCHAR(150) NOT NULL,
    TenderCategory  VARCHAR(50),
    ClosingDate     DATE NOT NULL,
    EstimatedValue  NUMERIC(15,2) NOT NULL,
    SubmittedValue  NUMERIC(15,2),
    WinValue        NUMERIC(15,2),
    Status          VARCHAR(20) NOT NULL DEFAULT 'Prospect',
    TenderOwnerId   UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_tender_tenderno UNIQUE (TenderNo),
    CONSTRAINT chk_tender_status CHECK (Status IN
        ('Prospect','Qualified','InProgress','Submitted','Clarification','Won','Lost','Cancelled')),
    CONSTRAINT chk_tender_estimatedvalue CHECK (EstimatedValue > 0),
    CONSTRAINT chk_tender_submittedvalue CHECK (SubmittedValue IS NULL OR SubmittedValue >= 0),
    -- FR-58 / Wireframe Spec Screen 4: WinValue only meaningful once Status = Won;
    -- enforced at the application layer (PATCH /api/tender/:id, API Spec §6) rather
    -- than a CHECK constraint, since the constraint would need to evaluate against
    -- the value at the moment Status transitions, which a stateless CHECK cannot do.
    CONSTRAINT chk_tender_winvalue CHECK (WinValue IS NULL OR WinValue >= 0)
);
COMMENT ON TABLE TENDER IS 'PRD §4.3, §11 — v1.1 top-level business object; Tender → WO → Task → Effort hierarchy (FR-57)';
COMMENT ON COLUMN TENDER.TenderNo IS 'Auto-generated by the application layer at creation; never entered manually (FR-57, API Spec POST /api/tender validation)';

CREATE INDEX idx_tender_status_closing ON TENDER(Status, ClosingDate);
CREATE INDEX idx_tender_owner ON TENDER(TenderOwnerId);
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 005: CSI Work Order (Core)
-- Reference: Database Design Specification v1.0 §3.8
-- Table: CSI_WO
-- Depends on: EXTERNAL_WO, TENDER, REQUEST_TYPE, COMPLEXITY_TIER, STAFF
-- ════════════════════════════════════════════════════════════════════════════

-- DB Spec §3: "The internal work order — the platform's central operational
-- record (PRD §7.2). The busiest table in the schema by both read and write
-- volume." Auto-numbered 300-DDMMYYYY-NNN (CSI) by the application layer.
CREATE TABLE CSI_WO (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CSI_WO_No       VARCHAR(40) NOT NULL,
    ExtWO_Id        UUID NOT NULL REFERENCES EXTERNAL_WO(Id) ON DELETE RESTRICT,
    TenderId        UUID REFERENCES TENDER(Id) ON DELETE SET NULL,
    RequestTypeId   UUID NOT NULL REFERENCES REQUEST_TYPE(Id) ON DELETE RESTRICT,
    Title           VARCHAR(200) NOT NULL,
    Priority        VARCHAR(10) NOT NULL DEFAULT 'Normal',
    IndicativeValue NUMERIC(15,2),
    ComplexityValue NUMERIC(10,2),
    TaskScore       NUMERIC(6,2),
    TierId          UUID NOT NULL REFERENCES COMPLEXITY_TIER(Id) ON DELETE RESTRICT,
    CreatedBy       UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    AssignedTo      UUID REFERENCES STAFF(Id) ON DELETE SET NULL,
    DueDate         DATE,
    Status          VARCHAR(20) NOT NULL DEFAULT 'Open',
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    -- FR-05 / DB Spec §4 relationship #5: 1:1 with EXTERNAL_WO, enforced by
    -- this UNIQUE constraint, preventing duplicate shadow numbering against
    -- the same external reference.
    CONSTRAINT uq_csiwo_csiwono UNIQUE (CSI_WO_No),
    CONSTRAINT uq_csiwo_extwoid UNIQUE (ExtWO_Id),
    CONSTRAINT chk_csiwo_priority CHECK (Priority IN ('Low','Normal','High','Urgent')),
    CONSTRAINT chk_csiwo_status CHECK (Status IN ('Open','InProgress','PendingApproval','Closed','OnHold')),
    CONSTRAINT chk_csiwo_indicativevalue CHECK (IndicativeValue IS NULL OR IndicativeValue >= 0),
    CONSTRAINT chk_csiwo_complexityvalue CHECK (ComplexityValue IS NULL OR ComplexityValue >= 0)
);
COMMENT ON TABLE CSI_WO IS 'PRD §7.2, §11 — internal work order; central operational record (FR-06–09)';
COMMENT ON COLUMN CSI_WO.CSI_WO_No IS 'Auto-generated 300-DDMMYYYY-NNN (CSI) format by the application layer at creation';
COMMENT ON COLUMN CSI_WO.TaskScore IS 'System-computed from ComplexityValue and tier rules (FR-04); not directly editable via the API';
COMMENT ON COLUMN CSI_WO.AssignedTo IS 'Denormalised pointer to the current assignee; full history retained in ASSIGNMENT (DB Spec §3.9)';

-- Indexes supporting Wireframe Spec / API Spec filters and sorts (DB Spec §5)
CREATE INDEX idx_csiwo_status ON CSI_WO(Status);
CREATE INDEX idx_csiwo_assignedto ON CSI_WO(AssignedTo);
CREATE INDEX idx_csiwo_duedate ON CSI_WO(DueDate);
CREATE INDEX idx_csiwo_tenderid ON CSI_WO(TenderId);
CREATE INDEX idx_csiwo_reqtype ON CSI_WO(RequestTypeId);
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 006: Work Order Child Tables
-- Reference: Database Design Specification v1.0 §3.9–3.12
-- Tables: ASSIGNMENT, EFFORT_LOG, EVIDENCE_DELIVERABLE, APPROVAL_RECORD
-- Depends on: CSI_WO, STAFF, COMPLEXITY_TIER
-- All four CASCADE from CSI_WO (DB Spec §4): child records are meaningless
-- without their parent WO.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ASSIGNMENT ──────────────────────────────────────────────────────────────
-- DB Spec §3: "Full assignment chain per WO, including Team Lead to Team
-- Member cascades (FR-10–12)."
CREATE TABLE ASSIGNMENT (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CSI_WO_Id       UUID NOT NULL REFERENCES CSI_WO(Id) ON DELETE CASCADE,
    StaffId         UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    AssignedHours   NUMERIC(6,2) NOT NULL,
    AssignedDate    DATE NOT NULL,
    AssignedBy      UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    IsCurrent       BOOLEAN NOT NULL DEFAULT true,
    ReassignReason  TEXT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT chk_assignment_hours_positive CHECK (AssignedHours > 0)
);
COMMENT ON TABLE ASSIGNMENT IS 'PRD §7.3, §11 — full assignment chain including reassignment history (FR-10–13)';
COMMENT ON COLUMN ASSIGNMENT.IsCurrent IS 'Distinguishes the active assignment row from historical reassignment rows; only one row per CSI_WO_Id should be true at a time, enforced by the application layer transaction in API Spec POST /api/wo/:id/assign';

CREATE INDEX idx_assignment_staff_current ON ASSIGNMENT(StaffId, IsCurrent);
CREATE INDEX idx_assignment_wo ON ASSIGNMENT(CSI_WO_Id);
-- Partial unique index: at most one current assignment per WO at any time.
-- This is the database-level backstop for the "one current assignee" rule
-- the application layer is responsible for maintaining (see comment above).
CREATE UNIQUE INDEX uq_assignment_one_current_per_wo ON ASSIGNMENT(CSI_WO_Id) WHERE IsCurrent = true;

-- ── EFFORT_LOG ──────────────────────────────────────────────────────────────
-- DB Spec §3: "Daily effort entries, replacing the manual Daily_Log spreadsheet (FR-29)."
CREATE TABLE EFFORT_LOG (
    Id          UUID NOT NULL DEFAULT gen_random_uuid(),
    CSI_WO_Id   UUID NOT NULL REFERENCES CSI_WO(Id) ON DELETE CASCADE,
    StaffId     UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    LogDate     DATE NOT NULL,
    Hours       NUMERIC(4,2) NOT NULL,
    Notes       TEXT,
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt   TIMESTAMPTZ,
    CONSTRAINT pk_effortlog PRIMARY KEY (Id, LogDate),
    CONSTRAINT chk_effortlog_hours CHECK (Hours > 0 AND Hours <= 8)
) PARTITION BY RANGE (LogDate);
COMMENT ON TABLE EFFORT_LOG IS 'PRD §7.9, §11, §13.1 — daily effort entries; range-partitioned by LogDate (DB Spec §7, SAD §7) for the high write volume this table receives';
COMMENT ON COLUMN EFFORT_LOG.Id IS 'Primary key is composite (Id, LogDate) because PostgreSQL requires the partition key to be part of any unique constraint on a partitioned table; Id alone remains effectively globally unique since it is a UUID';

-- Monthly partitions for EFFORT_LOG. See migration 015 (partition maintenance)
-- for the automated approach using pg_partman in a production environment;
-- this migration creates the initial set of partitions covering the go-live
-- window so the schema is immediately usable.
CREATE TABLE effort_log_2026_06 PARTITION OF EFFORT_LOG FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE effort_log_2026_07 PARTITION OF EFFORT_LOG FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE effort_log_2026_08 PARTITION OF EFFORT_LOG FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE effort_log_2026_09 PARTITION OF EFFORT_LOG FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE effort_log_default PARTITION OF EFFORT_LOG DEFAULT;

CREATE INDEX idx_effortlog_staff_date ON EFFORT_LOG(StaffId, LogDate);
CREATE INDEX idx_effortlog_wo ON EFFORT_LOG(CSI_WO_Id);

-- ── EVIDENCE_DELIVERABLE ────────────────────────────────────────────────────
-- DB Spec §3: "Evidence and deliverable repository tied to the WO closure
-- checklist (FR-30)."
CREATE TABLE EVIDENCE_DELIVERABLE (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CSI_WO_Id       UUID NOT NULL REFERENCES CSI_WO(Id) ON DELETE CASCADE,
    FileRef         VARCHAR(500) NOT NULL,
    EvidenceType    VARCHAR(50) NOT NULL,
    UploadedBy      UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    UploadedDate    TIMESTAMPTZ NOT NULL DEFAULT now(),
    RemovedAt       TIMESTAMPTZ,
    RemovedBy       UUID REFERENCES STAFF(Id) ON DELETE RESTRICT,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ
);
COMMENT ON TABLE EVIDENCE_DELIVERABLE IS 'PRD §7.9, §11 — evidence repository; soft-delete only via RemovedAt/RemovedBy (API Spec DELETE /api/evidence/:id)';
COMMENT ON COLUMN EVIDENCE_DELIVERABLE.FileRef IS 'Object storage path/key; binary content is never stored in the database (SAD §7)';

CREATE INDEX idx_evidence_wo ON EVIDENCE_DELIVERABLE(CSI_WO_Id);

-- ── APPROVAL_RECORD ─────────────────────────────────────────────────────────
-- DB Spec §3: "Approval trail by complexity tier, including rework returns and
-- overrides."
CREATE TABLE APPROVAL_RECORD (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CSI_WO_Id       UUID NOT NULL REFERENCES CSI_WO(Id) ON DELETE CASCADE,
    TierId          UUID NOT NULL REFERENCES COMPLEXITY_TIER(Id) ON DELETE RESTRICT,
    ApprovedBy      UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    Decision        VARCHAR(20) NOT NULL,
    Reason          TEXT,
    DecisionDate    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT chk_approvalrecord_decision CHECK (Decision IN ('Approved','Returned'))
);
COMMENT ON TABLE APPROVAL_RECORD IS 'PRD §7.10, §11 — approval trail by complexity tier (FR-33); Reason mandatory at application layer when Decision = Returned';

CREATE INDEX idx_approval_wo ON APPROVAL_RECORD(CSI_WO_Id);
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
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 008: KPI & Opportunity of Interest Tracking
-- Reference: Database Design Specification v1.0 §3.18–3.19
-- Tables: KPI_RECORD, OI_TRACKER
-- Depends on: STAFF, ROLE
-- ════════════════════════════════════════════════════════════════════════════

-- ── KPI_RECORD ──────────────────────────────────────────────────────────────
-- DB Spec §3: "Live KPI scorecard data, replacing the static KPI cascade
-- document (PRD §14)."
CREATE TABLE KPI_RECORD (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    StaffId         UUID NOT NULL REFERENCES STAFF(Id) ON DELETE CASCADE,
    RoleId          UUID NOT NULL REFERENCES ROLE(Id) ON DELETE RESTRICT,
    Period          VARCHAR(10) NOT NULL,
    MetricName      VARCHAR(100) NOT NULL,
    TargetValue     NUMERIC(10,2),
    AchievedValue   NUMERIC(10,2),
    CalculatedAt    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_kpirecord_staff_period_metric UNIQUE (StaffId, Period, MetricName)
);
COMMENT ON TABLE KPI_RECORD IS 'PRD §14, §11 — live, role-cascaded KPI scorecard; system-calculated, never manually overridden (PRD §12 KPI Dashboard validation rules)';

CREATE INDEX idx_kpi_staff_period ON KPI_RECORD(StaffId, Period);

-- ── OI_TRACKER ──────────────────────────────────────────────────────────────
-- DB Spec §3: "Opportunity of Interest counts against role-specific annual
-- targets (PRD §14)."
CREATE TABLE OI_TRACKER (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    StaffId     UUID NOT NULL REFERENCES STAFF(Id) ON DELETE CASCADE,
    Period      VARCHAR(10) NOT NULL,
    Registered  INTEGER NOT NULL DEFAULT 0,
    Won         INTEGER NOT NULL DEFAULT 0,
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt   TIMESTAMPTZ,
    CONSTRAINT uq_oitracker_staff_period UNIQUE (StaffId, Period),
    CONSTRAINT chk_oitracker_nonneg CHECK (Registered >= 0 AND Won >= 0),
    CONSTRAINT chk_oitracker_won_le_registered CHECK (Won <= Registered)
);
COMMENT ON TABLE OI_TRACKER IS 'PRD §14, §11 — Opportunity of Interest registered/won counts against role-specific annual targets (BRL-07)';
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
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 010: Role Split Configuration
-- Reference: Database Design Specification v1.0 §3.24
-- Table: ROLE_SPLIT
-- Depends on: DEPARTMENT, ROLE
-- ════════════════════════════════════════════════════════════════════════════

-- DB Spec §3: "Percentage of adjusted department hours allocated per role
-- (PRD §13.3, FR-49)." Percentages must sum to 100% per DeptId; this is
-- validated at the application layer (API Spec PUT /api/admin/role-split,
-- a full atomic replace of all rows for a department) because a per-row
-- CHECK constraint cannot evaluate an aggregate across sibling rows.
CREATE TABLE ROLE_SPLIT (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    DeptId      UUID NOT NULL REFERENCES DEPARTMENT(Id) ON DELETE RESTRICT,
    RoleId      UUID NOT NULL REFERENCES ROLE(Id) ON DELETE RESTRICT,
    Percentage  NUMERIC(5,2) NOT NULL,
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt   TIMESTAMPTZ,
    CONSTRAINT uq_rolesplit_dept_role UNIQUE (DeptId, RoleId),
    CONSTRAINT chk_rolesplit_percentage CHECK (Percentage >= 0 AND Percentage <= 100)
);
COMMENT ON TABLE ROLE_SPLIT IS 'PRD §13.3, §11 — role-split percentage of adjusted hours per department (FR-49); must sum to 100% per DeptId, validated at the application layer';
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 011: Audit Log (Immutable Compliance Ledger)
-- Reference: Database Design Specification v1.0 §3.25, §6 (Audit Log Design)
--            System Architecture Design v1.0 §9 (Audit Trail Architecture)
-- Table: AUDIT_LOG
-- Depends on: STAFF
-- ════════════════════════════════════════════════════════════════════════════

-- DB Spec §6: "The platform-wide, immutable compliance ledger ... INSERT-only
-- — the application's database role has no UPDATE or DELETE grant on this
-- table, enforced at the database level." Range-partitioned by PerformedAt
-- at the calendar-month boundary (DB Spec §6.4).
CREATE TABLE AUDIT_LOG (
    Id              BIGSERIAL NOT NULL,
    EntityName      VARCHAR(50) NOT NULL,
    EntityId        UUID NOT NULL,
    Action          VARCHAR(20) NOT NULL,
    FieldName       VARCHAR(100),
    OldValue        TEXT,
    NewValue        TEXT,
    Reason          TEXT,
    PerformedBy     UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    PerformedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ChecksumHash    VARCHAR(64) NOT NULL,
    CONSTRAINT pk_auditlog PRIMARY KEY (Id, PerformedAt),
    CONSTRAINT chk_auditlog_action CHECK (Action IN
        ('Insert','Update','StatusChange','Approve','Return','Override','Export','Delete'))
) PARTITION BY RANGE (PerformedAt);
COMMENT ON TABLE AUDIT_LOG IS 'DB Spec §6, SAD §9 — immutable, hash-chained compliance ledger. EntityName/EntityId is intentionally not FK-enforced (polymorphic across all governed tables)';
COMMENT ON COLUMN AUDIT_LOG.Id IS 'Primary key is composite (Id, PerformedAt) because PostgreSQL requires the partition key as part of any unique constraint; BIGSERIAL still gives a strictly increasing sequence for chain verification';
COMMENT ON COLUMN AUDIT_LOG.EntityId IS 'PK of the affected row in EntityName''s table — not FK-enforced because a single column cannot reference 24 different parent tables; the nightly integrity check (SAD §9) validates entity existence separately';
COMMENT ON COLUMN AUDIT_LOG.ChecksumHash IS 'SHA-256 of PreviousHash + row content (DB Spec §6.3); computed by the application layer''s audit interceptor before INSERT, using pgcrypto digest() is also acceptable if computed via a trigger — see note below';

-- Monthly partitions, covering the go-live window. See migration 015 for the
-- pg_partman-based automated partition maintenance approach recommended for
-- production (DB Spec §6.4).
CREATE TABLE audit_log_2026_06 PARTITION OF AUDIT_LOG FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_log_2026_07 PARTITION OF AUDIT_LOG FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_log_2026_08 PARTITION OF AUDIT_LOG FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_log_2026_09 PARTITION OF AUDIT_LOG FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_log_default PARTITION OF AUDIT_LOG DEFAULT;

CREATE INDEX idx_auditlog_entity ON AUDIT_LOG(EntityName, EntityId);
CREATE INDEX idx_auditlog_performedat ON AUDIT_LOG(PerformedAt);
CREATE INDEX idx_auditlog_performedby ON AUDIT_LOG(PerformedBy);

-- ── Immutability enforcement (DB Spec §6.3) ─────────────────────────────────
-- The application's runtime database role (csidop_app) must never be able to
-- UPDATE or DELETE rows in AUDIT_LOG, even via a bug or a compromised
-- credential. This is enforced here at the database level, not left to
-- application-layer discipline alone.
--
-- This statement is run against the application role created during
-- environment provisioning (see seed/000_roles.sql). If that role does not
-- yet exist in the target environment, run seed/000_roles.sql first.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csidop_app') THEN
        EXECUTE 'REVOKE UPDATE, DELETE ON AUDIT_LOG FROM csidop_app';
        EXECUTE 'GRANT INSERT, SELECT ON AUDIT_LOG TO csidop_app';
    END IF;
END $$;
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 012: UpdatedAt Auto-Update Trigger
-- Reference: Database Design Specification v1.0 §1.4
-- "UpdatedAt (TIMESTAMP, nullable, set by application or trigger on update)"
--
-- This migration implements the trigger option: a single reusable trigger
-- function applied to every table, so the application layer never has to
-- remember to set UpdatedAt manually on every UPDATE statement.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.UpdatedAt = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_at() IS 'DB Spec §1.4 — standard UpdatedAt maintenance trigger, applied to every table below';

-- Applied to every table carrying an UpdatedAt column (all 25 tables except
-- AUDIT_LOG and STAFF_SKILL's composite-key pattern, both of which use their
-- own timestamp column — PerformedAt and LastAssessmentDate respectively —
-- as the meaningful "last touched" marker instead).
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'department','role','request_type','baseline_tier','multiplier_factor',
        'system_setting','complexity_tier','staff','external_wo','tender',
        'csi_wo','assignment','effort_log','evidence_deliverable','approval_record',
        'tender_scoring','gonogo_evaluation','kpi_record','oi_tracker',
        'skill','staff_skill','certification','training_plan','role_split'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_set_updated_at ON %I;
             CREATE TRIGGER trg_set_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
            tbl, tbl
        );
    END LOOP;
END $$;
-- ════════════════════════════════════════════════════════════════════════════
-- Migration 013: Automatic Partition Immutability Enforcement
-- Reference: Database Design Specification v1.0 §6.3 (Immutability & Tamper-Evidence)
--            System Architecture Design v1.0 §9 (Audit Trail Architecture)
--
-- WHY THIS MIGRATION EXISTS
-- PostgreSQL does NOT automatically propagate a partitioned table's GRANT
-- restrictions to partitions created after that GRANT was issued (verified
-- empirically during development of this migration set — a freshly created
-- partition inherits the schema's ALTER DEFAULT PRIVILEGES setting instead,
-- which is broader than what AUDIT_LOG requires). Without this migration,
-- every new monthly AUDIT_LOG partition — whether created manually or by
-- pg_partman — would silently reopen UPDATE/DELETE access for csidop_app,
-- defeating the immutability guarantee for that month's data until someone
-- noticed and manually re-applied the restricted grant.
--
-- This migration closes that gap permanently using a PostgreSQL event
-- trigger: any CREATE TABLE that creates a new partition of AUDIT_LOG is
-- automatically locked down to INSERT+SELECT only, with no dependency on a
-- human remembering to do it.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_audit_log_partition_immutability()
RETURNS event_trigger AS $$
DECLARE
    obj RECORD;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
        IF obj.command_tag = 'CREATE TABLE' THEN
            -- Only act if the newly created relation is a partition whose
            -- parent is AUDIT_LOG (covers both manual partition creation and
            -- pg_partman-managed creation, since both ultimately issue a
            -- CREATE TABLE ... PARTITION OF statement that fires this trigger).
            IF EXISTS (
                SELECT 1
                FROM pg_inherits i
                JOIN pg_class parent ON i.inhparent = parent.oid
                JOIN pg_class child  ON i.inhrelid  = child.oid
                WHERE child.oid = obj.objid
                  AND parent.relname = 'audit_log'
            ) THEN
                EXECUTE format('GRANT INSERT, SELECT ON %s TO csidop_app', obj.object_identity);
                EXECUTE format('REVOKE UPDATE, DELETE ON %s FROM csidop_app', obj.object_identity);
                RAISE NOTICE 'Audit log immutability auto-enforced on new partition: %', obj.object_identity;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_audit_log_partition_immutability() IS
    'DB Spec §6.3 — automatically restricts every new AUDIT_LOG partition to INSERT+SELECT for csidop_app, closing the gap where PostgreSQL does not propagate a parent table''s GRANT restrictions to partitions created after that GRANT was issued';

-- Event triggers are database-wide (not schema-scoped) and require superuser
-- or a role with the appropriate privilege to create; this migration must be
-- run by an administrative role (see README.md, "Running the Migrations").
DROP EVENT TRIGGER IF EXISTS trg_enforce_audit_log_immutability;
CREATE EVENT TRIGGER trg_enforce_audit_log_immutability
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE')
    EXECUTE FUNCTION enforce_audit_log_partition_immutability();

COMMENT ON EVENT TRIGGER trg_enforce_audit_log_immutability IS
    'Fires on every CREATE TABLE; the trigger function itself filters to AUDIT_LOG partitions only, so this does not affect any other table creation in the schema';

-- Apply the lockdown retroactively to every partition that already exists
-- (the four monthly partitions plus the default partition created in
-- migration 011), since the event trigger only catches partitions created
-- AFTER this migration runs.
DO $$
DECLARE
    part RECORD;
BEGIN
    FOR part IN
        SELECT child.relname
        FROM pg_inherits i
        JOIN pg_class parent ON i.inhparent = parent.oid
        JOIN pg_class child  ON i.inhrelid  = child.oid
        WHERE parent.relname = 'audit_log'
    LOOP
        EXECUTE format('GRANT INSERT, SELECT ON %I TO csidop_app', part.relname);
        EXECUTE format('REVOKE UPDATE, DELETE ON %I FROM csidop_app', part.relname);
    END LOOP;
END $$;
-- ════════════════════════════════════════════════════════════════════════════
-- Seed 000: Application Database Role
-- Reference: System Architecture Design v1.0 §7 (Database Architecture)
--            Database Design Specification v1.0 §6.3 (Immutability & Tamper-Evidence)
--
-- Run this BEFORE migration 011 (AUDIT_LOG) in a fresh environment, so the
-- REVOKE/GRANT statements in that migration have a role to act on. In this
-- reference implementation it is provided as a separate seed script (rather
-- than folded into 001_extensions.sql) because role/credential provisioning
-- is typically owned by infrastructure/DevOps, not the schema migration
-- pipeline — see SAD §14 (Deployment Architecture).
--
-- IMPORTANT: the password below is a placeholder for local development only.
-- In staging/production, the password must come from the secrets manager
-- (Kubernetes Secrets / Vault, per SAD §12) and never be committed to source
-- control.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csidop_app') THEN
        CREATE ROLE csidop_app WITH LOGIN PASSWORD 'CHANGE_ME_VIA_SECRETS_MANAGER';
    END IF;
END $$;

-- Baseline grants: the application role needs full CRUD on all operational
-- tables (enforced further by RBAC/row-level scope at the application layer,
-- SAD §5 — this database-level grant is necessarily coarser than that).
--
-- AUDIT_LOG is deliberately EXCLUDED from this broad grant. It receives its
-- own, narrower grant (INSERT + SELECT only) below, because granting it
-- UPDATE/DELETE here — even temporarily — would defeat the immutability
-- guarantee that is this table's entire purpose (DB Spec §6.3). This is
-- handled directly in this script (rather than relying on migration 011 to
-- run afterward and revoke it again) so the correct end-state does not
-- depend on script run order.
DO $$
DECLARE
    tbl text;
    op_tables text[] := ARRAY[
        'department','role','request_type','baseline_tier','multiplier_factor',
        'system_setting','complexity_tier','staff','external_wo','tender',
        'csi_wo','assignment','effort_log','evidence_deliverable','approval_record',
        'tender_scoring','gonogo_evaluation','kpi_record','oi_tracker',
        'skill','staff_skill','certification','training_plan','role_split'
    ];
BEGIN
    FOREACH tbl IN ARRAY op_tables LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO csidop_app', tbl);
    END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO csidop_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO csidop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO csidop_app;

-- AUDIT_LOG: INSERT + SELECT only — see DB Spec §6.3, SAD §9. This table may
-- not yet exist if this seed script is run before migration 011 in a fresh
-- environment; the IF EXISTS guard makes this script safe to run in either
-- order. Migration 011 also re-asserts this same grant for the reverse
-- ordering case, so the end state is correct regardless of which runs first.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        EXECUTE 'GRANT INSERT, SELECT ON AUDIT_LOG TO csidop_app';
        EXECUTE 'REVOKE UPDATE, DELETE ON AUDIT_LOG FROM csidop_app';
    END IF;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csidop_app;

-- DELETE is intentionally still granted broadly here, even though DB Spec
-- §1.4 establishes a soft-delete-only convention for STAFF and EVIDENCE_DELIVERABLE.
-- That convention is an application-layer discipline (the API never issues a
-- DELETE statement against those tables), not a database-level lock, because
-- a small number of genuinely disposable tables (e.g. draft/unconfirmed
-- upload-intent records, if added in a later phase) may legitimately need
-- hard deletes. AUDIT_LOG is the one table where immutability IS enforced at
-- the database level — see the REVOKE statement in migration 011, which
-- this seed script's GRANT above predates and which therefore correctly wins
-- (run migration 011 after this seed, or re-run its REVOKE block, in any
-- environment where grants were applied out of order).
-- ════════════════════════════════════════════════════════════════════════════
-- Seed 001: Master / Reference Data
-- Reference: PRD v1.1 §4.1 (Scope), §6 (User Roles), §13.1–13.3 (Capacity
--            Planning Logic); Database Design Specification v1.0 §3
--
-- Populates every lookup/configuration table with the values already
-- established in CSI's operating model (PRD §2.1) — this is configuration
-- data the business already uses today, not invented defaults.
-- ════════════════════════════════════════════════════════════════════════════

-- ── DEPARTMENT (PRD §4.2) ───────────────────────────────────────────────────
INSERT INTO DEPARTMENT (DeptCode, DeptName) VALUES
    ('CSI', 'Consultant, Solution & Innovation'),
    ('CMT', 'Capacity Management Team'),
    ('CPO', 'Corporate Project Office'),
    ('CGI', 'Corporate Governance & Integrity'),
    ('CSA', 'Corporate Strategy & Alliances'),
    ('CBA', 'Corporate Business Academy')
ON CONFLICT (DeptCode) DO NOTHING;

-- ── ROLE (PRD §6) ────────────────────────────────────────────────────────────
INSERT INTO ROLE (RoleCode, RoleName, CapacityScope) VALUES
    ('HOD',     'Head of Department',  'Department'),
    ('SM',      'Solution Manager',    'Stream'),
    ('TL',      'Team Lead',           'Pod'),
    ('TM',      'Team Member',         'Self'),
    ('BIM_TL',  'BIM Team Lead',       'Pod'),
    ('BIM_MOD', 'BIM Modeler',         'Self')
ON CONFLICT (RoleCode) DO NOTHING;

-- ── REQUEST_TYPE (PRD §4.1 — 12-type taxonomy with default SLA targets per FR-32) ──
INSERT INTO REQUEST_TYPE (TypeCode, TypeName, Domain, SlaAckDays, SlaClassifyDays, SlaRouteDays) VALUES
    (1,  'Leads / Opportunity',         'Solution Design',     1, 2, 3),
    (2,  'Tender / RFP',                'Solution Design',     1, 2, 3),
    (3,  'Documentation',               'Solution Design',     1, 2, 3),
    (4,  'Physical Consultancy',        'Consultancy',         1, 2, 3),
    (5,  'Non-Physical Consultancy',    'Consultancy',         1, 2, 3),
    (6,  'BIM Presales ICT',            'BIM',                 1, 2, 3),
    (7,  'BIM Presales Total Solution', 'BIM',                 1, 2, 3),
    (8,  'BIM Presales Management',     'BIM',                 1, 2, 3),
    (9,  'BIM Postsales ICT',           'BIM',                 1, 2, 3),
    (10, 'BIM Postsales Total Solution','BIM',                 1, 2, 3),
    (11, 'BIM Postsales Management',    'BIM',                 1, 2, 3),
    (12, 'Project Monitoring',          'Project Monitoring',  1, 2, 3)
ON CONFLICT (TypeCode) DO NOTHING;

-- ── COMPLEXITY_TIER (PRD §7.10, FR-33 — approval routing by tier) ──────────
INSERT INTO COMPLEXITY_TIER (TierCode, TierName, ApproverRoleId)
SELECT 1, 'Tier 1', Id FROM ROLE WHERE RoleCode = 'TL'
ON CONFLICT (TierCode) DO NOTHING;
INSERT INTO COMPLEXITY_TIER (TierCode, TierName, ApproverRoleId)
SELECT 2, 'Tier 2', Id FROM ROLE WHERE RoleCode = 'SM'
ON CONFLICT (TierCode) DO NOTHING;
INSERT INTO COMPLEXITY_TIER (TierCode, TierName, ApproverRoleId)
SELECT 3, 'Tier 3', Id FROM ROLE WHERE RoleCode = 'HOD'
ON CONFLICT (TierCode) DO NOTHING;

-- ── BASELINE_TIER (PRD §13.3 — default baseline hour allocation per tender size) ──
INSERT INTO BASELINE_TIER (TierSize, BaselineCSIHours, BaselineCMTHours) VALUES
    ('Small',  65.00,  20.00),
    ('Medium', 100.00, 35.00),
    ('Large',  200.00, 70.00),
    ('Mega',   320.00, 110.00)
ON CONFLICT (TierSize) DO NOTHING;

-- ── MULTIPLIER_FACTOR (PRD §13.3, FR-38 — default complexity multipliers) ──
INSERT INTO MULTIPLIER_FACTOR (FactorCode, MultiplierValue) VALUES
    ('Rush',          1.25),
    ('Consortium',    1.15),
    ('SecurityHeavy', 1.20),
    ('CustomDev',     1.30),
    ('ManyQA',        1.10),
    ('Onsite',        1.10)
ON CONFLICT (FactorCode) DO NOTHING;

-- ── SYSTEM_SETTING (PRD §13.1–13.4, §7.15 FR-53 — default configurable thresholds) ──
INSERT INTO SYSTEM_SETTING (SettingKey, SettingValue, Description) VALUES
    ('CSI_UTILIZATION_THRESHOLD',      '85',  'CSI department utilization threshold percentage (PRD §13.2)'),
    ('CMT_UTILIZATION_THRESHOLD',      '80',  'CMT department utilization threshold percentage (PRD §13.2)'),
    ('UTILIZATION_BAND_SAFE_MIN',      '50',  'Lower bound (%) of the Safe utilization band (PRD §13.2)'),
    ('UTILIZATION_BAND_WARNING_MIN',   '85',  'Lower bound (%) of the Warning utilization band (PRD §13.2)'),
    ('UTILIZATION_BAND_OVERLOADED_MIN','90',  'Lower bound (%) of the Overloaded utilization band (PRD §13.2)'),
    ('DEFAULT_WORKING_HOURS_PER_DAY',  '8',   'Standard working hours per day before productivity factor is applied (PRD §13.1)'),
    ('GONOGO_PLANNING_HORIZON_DAYS',   '10',  'Default planning horizon for Go/No-Go capacity projection (PRD §13.4, FR-39)'),
    ('CERT_EXPIRY_WINDOW_DAYS',        '90',  'Default certification expiry alert window (PRD §7.15, FR-53)'),
    ('AUDIT_LOG_RETENTION_YEARS',      '7',   'Audit log retention period, aligned to ISO 9001 / PDPA / MAMPU-KRISA requirements (DB Spec §6.4)'),
    ('HOD_ANNUAL_OI_REGISTERED_TARGET','8',   'HOD role annual Opportunity of Interest registered target (BRL-07)'),
    ('HOD_ANNUAL_OI_WON_TARGET',       '3',   'HOD role annual Opportunity of Interest won target (BRL-07)'),
    ('TL_ANNUAL_OI_REGISTERED_TARGET', '3',   'Team Lead role annual Opportunity of Interest registered target (BRL-07)'),
    ('TL_ANNUAL_OI_WON_TARGET',        '1',   'Team Lead role annual Opportunity of Interest won target (BRL-07)')
ON CONFLICT (SettingKey) DO NOTHING;

-- ── ROLE_SPLIT (PRD §13.3, FR-49 — default role-split percentages, must sum to 100% per department) ──
-- CSI department split
INSERT INTO ROLE_SPLIT (DeptId, RoleId, Percentage)
SELECT d.Id, r.Id, v.pct
FROM DEPARTMENT d, ROLE r,
    (VALUES ('HOD',5.00), ('SM',15.00), ('TL',25.00), ('TM',40.00), ('BIM_TL',7.00), ('BIM_MOD',8.00)) AS v(rolecode, pct)
WHERE d.DeptCode = 'CSI' AND r.RoleCode = v.rolecode
ON CONFLICT (DeptId, RoleId) DO NOTHING;

-- CMT department split
INSERT INTO ROLE_SPLIT (DeptId, RoleId, Percentage)
SELECT d.Id, r.Id, v.pct
FROM DEPARTMENT d, ROLE r,
    (VALUES ('HOD',5.00), ('SM',20.00), ('TL',30.00), ('TM',45.00)) AS v(rolecode, pct)
WHERE d.DeptCode = 'CMT' AND r.RoleCode = v.rolecode
ON CONFLICT (DeptId, RoleId) DO NOTHING;

-- ── SKILL (PRD §7.15 — starter skills inventory across the 8 technology domains) ──
INSERT INTO SKILL (SkillName, TechnologyDomain) VALUES
    ('AWS Solutions Architecture',     'Cloud'),
    ('Google Cloud Platform',          'Cloud'),
    ('Microsoft Azure',                'Cloud'),
    ('Network Security',               'Cyber Security'),
    ('Penetration Testing',            'Cyber Security'),
    ('Server Virtualization',          'Data Centre'),
    ('Storage Architecture',           'Data Centre'),
    ('Cisco Routing & Switching',      'Network'),
    ('SD-WAN',                         'Network'),
    ('TOGAF Enterprise Architecture',  'Enterprise Architecture'),
    ('Solution Architecture',          'Enterprise Architecture'),
    ('Machine Learning Operations',    'AI / HPC'),
    ('GPU Cluster Architecture',       'AI / HPC'),
    ('BIM Coordination',               'BIM'),
    ('Revit Modelling',                'BIM'),
    ('Tender Writing',                 'Consultancy'),
    ('Client Presentation',            'Consultancy')
ON CONFLICT (SkillName, TechnologyDomain) DO NOTHING;
