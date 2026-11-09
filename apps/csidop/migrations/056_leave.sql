-- ════════════════════════════════════════════════════════════════════════════
-- Migration 056: Leave planner (annual leave, MC and other leave)
-- Depends on: 003 (STAFF), 023 (ROLE_PERMISSION), 052 (module list)
--
-- CSIDOP is the CSI department's planner and approval view. The company's HR
-- system stays the official record, so balances here are a working figure and
-- an over-balance request is flagged, not blocked.
--
--   * Approval route: staff -> Solution Manager -> HOD. A Solution Manager's own
--     request goes straight to the HOD; the HOD's is recorded as approved.
--   * Everything is department-scoped (CSI now, CMT later).
--   * Entitlements are configuration, entered by the HOD: rules by years of
--     service, plus a per-person per-year balance row that can be adjusted.
--   * Leave year = calendar year (January to December).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE staff ADD COLUMN IF NOT EXISTS joindate DATE;
COMMENT ON COLUMN staff.joindate IS 'Date the person joined, used to pick the leave entitlement tier. Entered by the HOD in Leave setup.';

CREATE TABLE leave_type (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code           VARCHAR(20) NOT NULL,
    name           VARCHAR(60) NOT NULL,
    colour         VARCHAR(7)  NOT NULL DEFAULT '#6366f1',
    trackbalance   BOOLEAN     NOT NULL DEFAULT false,
    halfdayallowed BOOLEAN     NOT NULL DEFAULT true,
    active         BOOLEAN     NOT NULL DEFAULT true,
    sortorder      INT         NOT NULL DEFAULT 100,
    createdat      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_leavetype_code UNIQUE (code),
    CONSTRAINT chk_leavetype_colour CHECK (colour ~ '^#[0-9a-fA-F]{6}$')
);

-- Years of service -> days a year, per leave type that keeps a balance.
CREATE TABLE leave_entitlement_rule (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leavetypeid UUID NOT NULL REFERENCES leave_type(id) ON DELETE CASCADE,
    minyears    NUMERIC(4,1) NOT NULL DEFAULT 0 CHECK (minyears >= 0),
    days        NUMERIC(5,1) NOT NULL CHECK (days >= 0),
    CONSTRAINT uq_leaverule UNIQUE (leavetypeid, minyears)
);

-- One row per person, leave type and year. "Taken" and "pending" are worked out
-- from the requests, so only the inputs live here.
CREATE TABLE leave_balance (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staffid        UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    leavetypeid    UUID NOT NULL REFERENCES leave_type(id) ON DELETE RESTRICT,
    year           INT  NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    entitled       NUMERIC(5,1) NOT NULL DEFAULT 0,
    carriedforward NUMERIC(5,1) NOT NULL DEFAULT 0,
    adjustment     NUMERIC(5,1) NOT NULL DEFAULT 0,
    note           TEXT,
    updatedat      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_leavebalance UNIQUE (staffid, leavetypeid, year)
);
CREATE INDEX idx_leavebalance_year ON leave_balance (year);

CREATE TABLE public_holiday (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holidaydate DATE NOT NULL,
    name        VARCHAR(120) NOT NULL,
    createdby   UUID REFERENCES staff(id),
    createdat   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_publicholiday_date UNIQUE (holidaydate)
);

CREATE TABLE leave_request (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staffid       UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    leavetypeid   UUID NOT NULL REFERENCES leave_type(id) ON DELETE RESTRICT,
    startdate     DATE NOT NULL,
    enddate       DATE NOT NULL,
    daypart       VARCHAR(4) NOT NULL DEFAULT 'Full',
    days          NUMERIC(4,1) NOT NULL,
    reason        TEXT,
    coverstaffid  UUID REFERENCES staff(id),
    status        VARCHAR(12) NOT NULL,
    smdecidedby   UUID REFERENCES staff(id),
    smdecidedat   TIMESTAMPTZ,
    hoddecidedby  UUID REFERENCES staff(id),
    hoddecidedat  TIMESTAMPTZ,
    decisionnote  TEXT,
    cancelledat   TIMESTAMPTZ,
    createdat     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updatedat     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_leaverequest_status CHECK (status IN ('PendingSM','PendingHOD','Approved','Rejected','Cancelled')),
    CONSTRAINT chk_leaverequest_daypart CHECK (daypart IN ('Full','AM','PM')),
    CONSTRAINT chk_leaverequest_dates CHECK (enddate >= startdate AND (daypart = 'Full' OR startdate = enddate)),
    CONSTRAINT chk_leaverequest_days CHECK (days >= 0)
);
CREATE INDEX idx_leaverequest_staff ON leave_request (staffid, startdate);
CREATE INDEX idx_leaverequest_dates ON leave_request (startdate, enddate) WHERE status IN ('PendingSM','PendingHOD','Approved');
CREATE INDEX idx_leaverequest_status ON leave_request (status);

-- Small key/value settings for the module (e.g. who approves for the HOD while away).
CREATE TABLE leave_setting (
    key       VARCHAR(40) PRIMARY KEY,
    value     JSONB NOT NULL,
    updatedby UUID REFERENCES staff(id),
    updatedat TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Leave types to start with (the HOD can rename, recolour and switch off) ──
INSERT INTO leave_type (code, name, colour, trackbalance, halfdayallowed, sortorder) VALUES
    ('ANNUAL',    'Annual leave',            '#2563eb', true,  true,  10),
    ('MC',        'Medical leave (MC)',      '#dc2626', true,  true,  20),
    ('HOSP',      'Hospitalisation',         '#be123c', true,  false, 30),
    ('EMERGENCY', 'Emergency leave',         '#ea580c', false, true,  40),
    ('COMPASS',   'Compassionate leave',     '#7c3aed', false, true,  50),
    ('MATERNITY', 'Maternity leave',         '#db2777', false, false, 60),
    ('PATERNITY', 'Paternity leave',         '#0891b2', false, false, 70),
    ('REPLACE',   'Replacement leave',       '#16a34a', false, true,  80),
    ('STUDY',     'Study / exam leave',      '#ca8a04', false, true,  90),
    ('UNPAID',    'Unpaid leave',            '#6b7280', false, true,  100),
    ('OTHER',     'Other',                   '#475569', false, true,  110);

-- ── Module access: everyone in CSI can open Leave ──────────────────────────
ALTER TABLE role_permission DROP CONSTRAINT chk_rp_module;
ALTER TABLE role_permission ADD CONSTRAINT chk_rp_module CHECK (ModuleCode IN (
    'dashboard','work_orders','wo_inbox','wo_progress','my_tasks',
    'workloads','capacity','kpi','skills','reports','admin','cmp','leave'
));
INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, 'leave', 'full' FROM role r
ON CONFLICT (roleid, modulecode) DO NOTHING;

-- ── Grants for the application role (no-op where it does not exist) ────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csidop_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON
            leave_type, leave_entitlement_rule, leave_balance, public_holiday, leave_request, leave_setting
            TO csidop_app;
    END IF;
END $$;
