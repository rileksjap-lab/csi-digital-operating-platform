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
