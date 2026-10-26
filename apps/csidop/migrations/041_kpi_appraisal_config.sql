-- Migration 041: KPI appraisal configuration
-- The real CSI KPI model is a weighted 1-5 rating per KRA line (60), plus 13 HR
-- value items (40) and 4 bonus items (20), maximum 120. Everything that can
-- change from year to year (lines, weights, targets, rating bands, items, score
-- outcome bands) lives in these tables and is edited in the app, never in code.
-- The appraisals themselves (self / superior / HOD ratings) come in a later
-- migration; this one is configuration plus the reporting line.

-- ── Reporting line (immediate superior) ─────────────────────────────────────
-- Drives who reviews whom in the appraisal workflow. Rows are never deleted
-- (deactivation is a Status change), so RESTRICT is the safe default.
ALTER TABLE STAFF ADD COLUMN ReportsTo UUID REFERENCES STAFF(Id) ON DELETE RESTRICT;
ALTER TABLE STAFF ADD CONSTRAINT chk_staff_reportsto_self CHECK (ReportsTo IS NULL OR ReportsTo <> Id);
CREATE INDEX idx_staff_reportsto ON STAFF(ReportsTo) WHERE ReportsTo IS NOT NULL;
COMMENT ON COLUMN STAFF.ReportsTo IS 'Immediate superior, used by the KPI appraisal workflow; NULL for the top of a reporting line';

-- ── SVP role ────────────────────────────────────────────────────────────────
-- The SVP appraises the HOD, so the SVP needs a login. Department scope keeps
-- the SVP's view department-wide; module access is view-only except KPI.
INSERT INTO ROLE (RoleCode, RoleName, CapacityScope)
VALUES ('SVP', 'Senior Vice President', 'Department');

INSERT INTO ROLE_PERMISSION (RoleId, ModuleCode, AccessLevel)
SELECT r.id, m.code, m.level
FROM ROLE r
CROSS JOIN (VALUES
    ('dashboard','view'),('work_orders','view'),('wo_inbox','none'),('wo_progress','view'),
    ('my_tasks','none'),('workloads','view'),('capacity','view'),('kpi','full'),
    ('skills','view'),('reports','view'),('admin','none')
) AS m(code, level)
WHERE r.rolecode = 'SVP';

-- ── Cycles ──────────────────────────────────────────────────────────────────
CREATE TABLE KPI_CYCLE (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CycleCode   VARCHAR(20) NOT NULL,
    Name        VARCHAR(100) NOT NULL,
    PeriodStart DATE NOT NULL,
    PeriodEnd   DATE NOT NULL,
    Status      VARCHAR(10) NOT NULL DEFAULT 'Draft',
    Config      JSONB NOT NULL DEFAULT '{}'::jsonb,
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt   TIMESTAMPTZ,
    CONSTRAINT uq_kpicycle_code UNIQUE (CycleCode),
    CONSTRAINT chk_kpicycle_status CHECK (Status IN ('Draft','Open','Closed')),
    CONSTRAINT chk_kpicycle_period CHECK (PeriodEnd >= PeriodStart)
);
COMMENT ON TABLE KPI_CYCLE IS 'An appraisal cycle (e.g. H1 2026). Config holds cycle-wide rules such as the certification points table.';

-- ── One template per role per cycle ─────────────────────────────────────────
CREATE TABLE KPI_TEMPLATE (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CycleId     UUID NOT NULL REFERENCES KPI_CYCLE(Id) ON DELETE CASCADE,
    RoleId      UUID NOT NULL REFERENCES ROLE(Id) ON DELETE RESTRICT,
    DisplayName VARCHAR(100) NOT NULL,
    SortOrder   SMALLINT NOT NULL DEFAULT 0,
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt   TIMESTAMPTZ,
    CONSTRAINT uq_kpitemplate_cycle_role UNIQUE (CycleId, RoleId)
);
COMMENT ON COLUMN KPI_TEMPLATE.DisplayName IS 'Role title as shown on the form for this cycle (titles change between cycles, e.g. Solution Manager / Deputy HOD)';

-- ── KRA lines of a template (the departmental 60%) ──────────────────────────
CREATE TABLE KPI_TEMPLATE_LINE (
    Id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    TemplateId       UUID NOT NULL REFERENCES KPI_TEMPLATE(Id) ON DELETE CASCADE,
    LineNo           SMALLINT NOT NULL,
    Name             VARCHAR(150) NOT NULL,
    Measurement      TEXT,
    Target           VARCHAR(300),
    Explanation      TEXT,
    Weight           NUMERIC(5,2) NOT NULL,
    EvidenceRequired BOOLEAN NOT NULL DEFAULT true,
    AutoMetric       VARCHAR(60),
    Bands            JSONB NOT NULL DEFAULT '{}'::jsonb,
    CreatedAt        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt        TIMESTAMPTZ,
    CONSTRAINT uq_kpitemplateline_no UNIQUE (TemplateId, LineNo),
    CONSTRAINT chk_kpitemplateline_weight CHECK (Weight > 0 AND Weight <= 100)
);
COMMENT ON COLUMN KPI_TEMPLATE_LINE.Bands IS 'Rating definitions as {"5": "...", "4": "...", "3": "...", "2": "...", "1": "..."}';
COMMENT ON COLUMN KPI_TEMPLATE_LINE.AutoMetric IS 'Optional KPI_RECORD metric name (e.g. SLA Compliance %) whose calculated value is shown as a suggested rating';
COMMENT ON COLUMN KPI_TEMPLATE_LINE.EvidenceRequired IS 'A rating above the baseline of 3 needs evidence when true';

-- ── HR value items (40) and bonus items (20), shared by every role ──────────
CREATE TABLE KPI_ITEM (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CycleId     UUID NOT NULL REFERENCES KPI_CYCLE(Id) ON DELETE CASCADE,
    Section     VARCHAR(10) NOT NULL,
    ItemNo      SMALLINT NOT NULL,
    Name        VARCHAR(150) NOT NULL,
    Description TEXT,
    Weight      NUMERIC(5,2) NOT NULL,
    ScaleMax    SMALLINT NOT NULL,
    InputMode   VARCHAR(12) NOT NULL DEFAULT 'Rating',
    Bands       JSONB NOT NULL DEFAULT '{}'::jsonb,
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt   TIMESTAMPTZ,
    CONSTRAINT uq_kpiitem_cycle_no UNIQUE (CycleId, ItemNo),
    CONSTRAINT chk_kpiitem_section CHECK (Section IN ('Value','Bonus')),
    CONSTRAINT chk_kpiitem_weight CHECK (Weight > 0 AND Weight <= 100),
    CONSTRAINT chk_kpiitem_scale CHECK (ScaleMax BETWEEN 2 AND 10),
    CONSTRAINT chk_kpiitem_mode CHECK (InputMode IN ('Rating','Certificates'))
);
COMMENT ON COLUMN KPI_ITEM.ScaleMax IS 'Highest score for the item (10 for items 1-9, 5 for the rest); a score is divided by this to get its share of the weight';
COMMENT ON COLUMN KPI_ITEM.InputMode IS 'Certificates = score is calculated from the certification points table (Employee Certifications)';

-- ── Score → outcome (increment, promotion, PIP ...) ─────────────────────────
CREATE TABLE KPI_OUTCOME_BAND (
    Id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    CycleId   UUID NOT NULL REFERENCES KPI_CYCLE(Id) ON DELETE CASCADE,
    MinScore  NUMERIC(5,2) NOT NULL,
    Outcome   TEXT NOT NULL,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_kpioutcome_min UNIQUE (CycleId, MinScore)
);
COMMENT ON TABLE KPI_OUTCOME_BAND IS 'A total score at or above MinScore (and below the next band) gets this outcome';

GRANT SELECT, INSERT, UPDATE, DELETE ON KPI_CYCLE, KPI_TEMPLATE, KPI_TEMPLATE_LINE, KPI_ITEM, KPI_OUTCOME_BAND TO csidop_app;
