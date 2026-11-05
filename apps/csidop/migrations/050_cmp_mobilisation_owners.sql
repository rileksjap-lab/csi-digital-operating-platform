-- ════════════════════════════════════════════════════════════════════════════
-- Migration 050: CMP Hierarchy Engine — Execution Mobilisation, Owner Matrix
-- Reference: TECH_00_DEVELOPER_README ("v1.2 execution update"),
--            05_EXECUTION_MOBILISATION, 06_OWNER_MATRIX
-- Tables: cmp_mobilisation_actions, cmp_owners
-- Depends on: staff, cmp_plans, cmp_workstreams (047)
-- ════════════════════════════════════════════════════════════════════════════

-- 90-day mobilisation tracker. workstream_label is free text, not an FK to
-- cmp_workstreams — the source sheet's Workstream column mixes real
-- workstreams (Healthcare, Cybersecurity) with mobilisation-only categories
-- that aren't business workstreams at all (Overall CMP, Ownership,
-- Financial, Tracker, CSIDOP), so a strict FK would reject valid rows.
CREATE TABLE cmp_mobilisation_actions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL REFERENCES cmp_plans(id) ON DELETE CASCADE,
    action_code         VARCHAR(20) NOT NULL,
    phase               VARCHAR(50) NOT NULL,
    days_range          VARCHAR(50),
    workstream_label    VARCHAR(200),
    deliverable         TEXT NOT NULL,
    owner_role_title    VARCHAR(100) NOT NULL,
    sponsor_role_title  VARCHAR(100),
    due_date            DATE,
    weight              NUMERIC(6,4),
    status              VARCHAR(20) NOT NULL DEFAULT 'Not Started',
    evidence_proof      TEXT,
    blocker             TEXT,
    support_required    TEXT,
    decision_required   TEXT,
    remarks             TEXT,
    created_by          UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ,
    CONSTRAINT uq_cmpmobilisation_code UNIQUE (plan_id, action_code),
    CONSTRAINT chk_cmpmobilisation_status CHECK (status IN ('Not Started','In Progress','Completed'))
);
COMMENT ON TABLE cmp_mobilisation_actions IS '90-day execution-readiness mobilisation tracker (source: 05_EXECUTION_MOBILISATION), introduced in tracker v1.2. RAG and readiness_contribution are computed at read time, not stored — same pattern as cmp_item_updates.';

-- Owner/sponsor accountability register, one row per workstream (plus a few
-- cross-cutting rows: Overall CMP, Financial Baseline, CSIDOP CMP Module).
-- workstream_label is free text for the same reason as above; workstream_id
-- is a nullable FK for rows that do map to a real cmp_workstreams row, so a
-- join is possible where applicable without forcing it on every row.
CREATE TABLE cmp_owners (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id                         UUID NOT NULL REFERENCES cmp_plans(id) ON DELETE CASCADE,
    workstream_label                VARCHAR(200) NOT NULL,
    workstream_id                   UUID REFERENCES cmp_workstreams(id) ON DELETE SET NULL,
    accountable_owner_role_title    VARCHAR(100) NOT NULL,
    management_sponsor_role_title   VARCHAR(100),
    deputy_backup_role_title        VARCHAR(100),
    finance_link_role_title         VARCHAR(100),
    commercial_link_role_title      VARCHAR(100),
    technical_lead_role_title       VARCHAR(100),
    first_evidence_required         TEXT,
    status                          VARCHAR(20) NOT NULL DEFAULT 'Pending',
    decision_needed                 TEXT,
    notes                           TEXT,
    CONSTRAINT uq_cmpowners_workstream UNIQUE (plan_id, workstream_label),
    CONSTRAINT chk_cmpowners_status CHECK (status IN ('Pending','Confirmed'))
);
COMMENT ON TABLE cmp_owners IS 'Owner/sponsor accountability matrix (source: 06_OWNER_MATRIX), introduced in tracker v1.2. A cmp_workstreams row should not transition to status=Active until its corresponding cmp_owners row has status=Confirmed (app-layer gate, same "Workstream Active rule" referenced on cmp_workstreams).';

CREATE INDEX idx_cmpmobilisation_planid ON cmp_mobilisation_actions(plan_id);
CREATE INDEX idx_cmpowners_planid ON cmp_owners(plan_id);
CREATE INDEX idx_cmpowners_workstreamid ON cmp_owners(workstream_id);
