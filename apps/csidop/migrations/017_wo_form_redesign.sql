-- ════════════════════════════════════════════════════════════════════════════
-- Migration 017: WO Form Redesign + WO Task Checklist
-- Aligns the CSI_WO table with the actual CSI department workflow:
--   - Source of Work Order (who sent it)
--   - Dual priority (inter-department + internal)
--   - SLA in working days (not a date)
--   - Monitoring staff (who oversees this WO)
--   - Tender/Project Code reference
--   - Remark field
--   - Make ExtWO_Id nullable (internal WOs have no external reference)
-- Also adds WO_TASK child table for task checklist with % progress,
-- and a TENDER_CHECKLIST_TEMPLATE for auto-populating tender WO tasks.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Widen DeptCode to accommodate longer codes, then add missing depts ─
ALTER TABLE DEPARTMENT ALTER COLUMN DeptCode TYPE VARCHAR(20);

INSERT INTO DEPARTMENT (DeptCode, DeptName) VALUES
    ('CST',         'Customer Service & Technical'),
    ('CSO',         'Customer Support Operations / Customization Software Office'),
    ('CSF',         'Corporate Services & Finance'),
    ('Legal',       'Legal Unit'),
    ('Procurement', 'Procurement Unit'),
    ('CHO',         'Chairman''s Office')
ON CONFLICT (DeptCode) DO NOTHING;

-- ── 2. Make ExtWO_Id nullable (internal WOs don't have external reference) ─
ALTER TABLE CSI_WO ALTER COLUMN ExtWO_Id DROP NOT NULL;

-- Drop the unique constraint on ExtWO_Id so multiple internal WOs can have NULL
ALTER TABLE CSI_WO DROP CONSTRAINT IF EXISTS uq_csiwo_extwoid;

-- ── 3. Add new columns to CSI_WO ──────────────────────────────────────────

-- Source of Work Order: who/which dept sent this WO
ALTER TABLE CSI_WO ADD COLUMN SourceOfWO VARCHAR(30);

-- Dual priority: inter-department priority (from requestor) + internal (CSI's own assessment)
ALTER TABLE CSI_WO RENAME COLUMN Priority TO PriorityInterdepart;
ALTER TABLE CSI_WO DROP CONSTRAINT chk_csiwo_priority;
ALTER TABLE CSI_WO ADD CONSTRAINT chk_csiwo_priority_interdepart
    CHECK (PriorityInterdepart IN ('Low', 'Normal', 'High', 'Urgent', 'Critical'));

ALTER TABLE CSI_WO ADD COLUMN PriorityInternal VARCHAR(10);
ALTER TABLE CSI_WO ADD CONSTRAINT chk_csiwo_priority_internal
    CHECK (PriorityInternal IS NULL OR PriorityInternal IN ('Low', 'Normal', 'High', 'Urgent', 'Critical', 'N/A'));

-- SLA in working days
ALTER TABLE CSI_WO ADD COLUMN SLAWorkingDays SMALLINT;
ALTER TABLE CSI_WO ADD CONSTRAINT chk_csiwo_sla_positive
    CHECK (SLAWorkingDays IS NULL OR SLAWorkingDays > 0);

-- Monitoring staff — who oversees this WO
ALTER TABLE CSI_WO ADD COLUMN MonitoringStaffId UUID REFERENCES STAFF(Id) ON DELETE SET NULL;
CREATE INDEX idx_csiwo_monitoring ON CSI_WO(MonitoringStaffId);

-- Tender No / Project Code — optional reference link
ALTER TABLE CSI_WO ADD COLUMN TenderOrProjectCode VARCHAR(50);

-- Remark
ALTER TABLE CSI_WO ADD COLUMN Remark TEXT;

-- ── 4. WO_TASK — checklist/task breakdown per work order ──────────────────
-- Staff updates Progress (0-100%) when progress happens.
-- WO overall % = average of all task progress values.
CREATE TABLE WO_TASK (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CSI_WO_Id       UUID NOT NULL REFERENCES CSI_WO(Id) ON DELETE CASCADE,
    TaskNo          SMALLINT NOT NULL,
    Description     VARCHAR(200) NOT NULL,
    AssignedTo      UUID REFERENCES STAFF(Id) ON DELETE SET NULL,
    Progress        SMALLINT NOT NULL DEFAULT 0,
    Scope           VARCHAR(10) NOT NULL DEFAULT 'Internal',
    DateCreated     DATE NOT NULL DEFAULT CURRENT_DATE,
    DateCompleted   DATE,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT chk_wotask_progress CHECK (Progress BETWEEN 0 AND 100),
    CONSTRAINT chk_wotask_scope CHECK (Scope IN ('Internal', 'External')),
    CONSTRAINT uq_wotask_wo_taskno UNIQUE (CSI_WO_Id, TaskNo)
);
COMMENT ON TABLE WO_TASK IS 'Task breakdown / checklist per work order. Staff updates progress %. WO completion = avg of task progress.';
CREATE INDEX idx_wotask_wo ON WO_TASK(CSI_WO_Id);
CREATE INDEX idx_wotask_assignedto ON WO_TASK(AssignedTo);

-- ── 5. Tender checklist baseline template ─────────────────────────────────
-- When a Tender/RFP work order is created, these tasks are auto-populated.
-- HOD/Manager can add more for complex tenders.
CREATE TABLE TENDER_CHECKLIST_TEMPLATE (
    Id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    TaskNo          SMALLINT NOT NULL,
    Description     VARCHAR(200) NOT NULL,
    DefaultScope    VARCHAR(10) NOT NULL DEFAULT 'Internal',
    IsActive        BOOLEAN NOT NULL DEFAULT true,
    CreatedAt       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt       TIMESTAMPTZ,
    CONSTRAINT uq_tendertemplate_taskno UNIQUE (TaskNo),
    CONSTRAINT chk_tendertemplate_scope CHECK (DefaultScope IN ('Internal', 'External'))
);
COMMENT ON TABLE TENDER_CHECKLIST_TEMPLATE IS 'Baseline tender checklist items auto-populated into WO_TASK for Tender/RFP work orders.';

-- Seed baseline tender checklist
INSERT INTO TENDER_CHECKLIST_TEMPLATE (TaskNo, Description, DefaultScope) VALUES
    (1,  'Cost Calculation (Culcu)',           'Internal'),
    (2,  'Experience Profile (EP Fill)',       'Internal'),
    (3,  'Performance / Track Record',         'Internal'),
    (4,  'Implementation Schedule',            'Internal'),
    (5,  'Compliance Matrix',                  'Internal'),
    (6,  'Organisation Chart',                 'Internal'),
    (7,  'Project Team',                       'Internal'),
    (8,  'Recommendations / Proposals',        'Internal'),
    (9,  'Catalogue / Brochure',               'Internal'),
    (10, 'Technical Proposal Write-up',        'Internal'),
    (11, 'Solution Architecture Diagram',      'Internal'),
    (12, 'Bill of Materials (BOM)',             'Internal'),
    (13, 'Risk Assessment',                    'Internal'),
    (14, 'Quality Assurance Plan',             'Internal'),
    (15, 'Project Timeline / Gantt Chart',     'Internal'),
    (16, 'Review & Final Submission',          'Internal')
ON CONFLICT (TaskNo) DO NOTHING;

COMMIT;
