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
