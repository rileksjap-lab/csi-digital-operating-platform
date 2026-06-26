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
