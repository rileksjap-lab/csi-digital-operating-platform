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
