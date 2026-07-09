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
