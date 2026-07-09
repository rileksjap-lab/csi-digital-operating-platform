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
