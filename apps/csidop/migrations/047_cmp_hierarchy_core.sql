-- ════════════════════════════════════════════════════════════════════════════
-- Migration 047: CMP Hierarchy Engine — Core
-- Reference: documents/CSI_CMP_Master_Tracker_v1.2_Execution_Ready_CSIDOP.xlsx
--            (TECH_01_DATA_DICTIONARY, TECH_02_SCORING_AND_RAG, 01_PLAN_SETUP,
--            02_PROGRESS_UPDATE), Claude_CSIDOP_CMP_Integration_Master_Prompt_v1.3
-- Tables: cmp_periods, cmp_plans, cmp_workstreams, cmp_initiatives, cmp_factors,
--         cmp_items, cmp_item_updates
-- Depends on: staff
--
-- Naming note: this and subsequent CMP migrations use lowercase snake_case
-- column names (workstream_code, scoring_method, ...) rather than the
-- PascalCase-DDL style used elsewhere in this schema (CSI_WO, AssignedTo).
-- This is deliberate: TECH_01_DATA_DICTIONARY in the source tracker literally
-- specifies these column names (e.g. "cmp_items.scoring_method"), and
-- PascalCase identifiers fold to run-together lowercase in Postgres
-- (ScoringMethod -> scoringmethod, no underscore), which would not match the
-- spec's literal naming. Every other CSIDOP table is unaffected.
--
-- Replaces migrations 033-038 from the prior (2026-07-17) CMP schema attempt,
-- which modelled CMP as fixed named entities (Milestone, Risk, BusinessPillar,
-- ...). That schema was fully dropped (see migrations/_archive/rollback_033-038
-- _old_cmp_schema.sql) once the source tracker/prompt revealed the actual
-- target is a generic configurable weighted hierarchy, not fixed entities.
-- ════════════════════════════════════════════════════════════════════════════

-- Reusable period lookup (baseline quarters referenced by cmp_items and
-- cmp_snapshots) — same purpose as the prior schema's CMP_PERIOD, renamed to
-- match the new naming convention.
CREATE TABLE cmp_periods (
    code            VARCHAR(10) PRIMARY KEY,
    label           VARCHAR(20) NOT NULL,
    year_number     SMALLINT,
    quarter_number  SMALLINT,
    sort_order      SMALLINT NOT NULL UNIQUE,
    CONSTRAINT chk_cmpperiods_quarter CHECK (quarter_number IS NULL OR quarter_number BETWEEN 1 AND 4)
);
COMMENT ON TABLE cmp_periods IS 'Fixed period enum (Baseline + Y1Q1..Y5Q4), referenced by cmp_items.baseline_period_code and cmp_snapshots.period_code';

-- The CMP plan itself. Practically a singleton today (one 5-year plan), but
-- modelled as a real table (not a config row) since the source tracker's own
-- data dictionary gives it a proper ID ("CMP-2026-2031").
CREATE TABLE cmp_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_code       VARCHAR(30) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    baseline_status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    locked_at       TIMESTAMPTZ,
    locked_by       UUID REFERENCES staff(id) ON DELETE SET NULL,
    created_by      UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ,
    CONSTRAINT uq_cmpplans_code UNIQUE (plan_code),
    CONSTRAINT chk_cmpplans_baselinestatus CHECK (baseline_status IN ('Draft','Locked','Approved')),
    CONSTRAINT chk_cmpplans_locked CHECK ((locked_at IS NULL) = (locked_by IS NULL))
);
COMMENT ON TABLE cmp_plans IS 'The CMP plan (practically singleton, e.g. CMP-2026-2031); baseline_status gates whether structural fields on workstreams/initiatives/factors/items can still be edited directly vs requiring a cmp_change_requests record';

-- Top-level workstreams (New Co Establishment, Cloud Subsidiary, BIM
-- Subsidiary, Cybersecurity Subsidiary, Healthcare Technology & Digital
-- Health, Core Commercial Practices, Commercial & Revenue Architecture,
-- Financial & Break-Even, ... — seeded from 01_PLAN_SETUP once real content
-- is imported, not hardcoded here since the workstream list itself is
-- configurable per the source spec, not a fixed enum).
CREATE TABLE cmp_workstreams (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id               UUID NOT NULL REFERENCES cmp_plans(id) ON DELETE CASCADE,
    workstream_code       VARCHAR(20) NOT NULL,
    name                  VARCHAR(200) NOT NULL,
    weight                NUMERIC(6,4) NOT NULL,
    sort_order            SMALLINT NOT NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'Draft',
    owner_role_title      VARCHAR(100),
    sponsor_role_title    VARCHAR(100),
    created_by            UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ,
    CONSTRAINT uq_cmpworkstreams_code UNIQUE (plan_id, workstream_code),
    CONSTRAINT chk_cmpworkstreams_status CHECK (status IN ('Draft','Active'))
);
COMMENT ON TABLE cmp_workstreams IS 'Top-level workstreams under a plan; status=Active only once owner, sponsor, items, weights, financial assumptions, evidence model and review cadence are confirmed (app-layer gate, "Workstream Active rule" per TECH_00_DEVELOPER_README). Application layer must enforce SUM(weight) = 1.0 across workstreams within a plan.';

CREATE TABLE cmp_initiatives (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workstream_id   UUID NOT NULL REFERENCES cmp_workstreams(id) ON DELETE CASCADE,
    initiative_code VARCHAR(20) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    weight          NUMERIC(6,4) NOT NULL,
    sort_order      SMALLINT NOT NULL,
    created_by      UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cmpinitiatives_code UNIQUE (workstream_id, initiative_code)
);
COMMENT ON TABLE cmp_initiatives IS 'Initiatives under a workstream. Application layer must enforce SUM(weight) = 1.0 among initiatives within a workstream.';

CREATE TABLE cmp_factors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    initiative_id   UUID NOT NULL REFERENCES cmp_initiatives(id) ON DELETE CASCADE,
    factor_code     VARCHAR(20) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    weight          NUMERIC(6,4) NOT NULL,
    sort_order      SMALLINT NOT NULL,
    created_by      UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cmpfactors_code UNIQUE (initiative_id, factor_code)
);
COMMENT ON TABLE cmp_factors IS 'Readiness Factors under an initiative (e.g. Strategy, Commercial, Financial). Application layer must enforce SUM(weight) = 1.0 among factors within an initiative.';

-- Tracking Item definition (the "01_PLAN_SETUP" row). Scoring/status live in
-- cmp_item_updates, kept separate to mirror the source tracker's own
-- Setup-vs-Progress-Update split, and because setup fields become read-only
-- once the plan baseline is locked while progress fields stay editable.
CREATE TABLE cmp_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factor_id             UUID NOT NULL REFERENCES cmp_factors(id) ON DELETE CASCADE,
    item_code             VARCHAR(20) NOT NULL,
    name                  VARCHAR(300) NOT NULL,
    weight                NUMERIC(6,4) NOT NULL,
    scoring_method        VARCHAR(20) NOT NULL,
    critical_gate         BOOLEAN NOT NULL DEFAULT false,
    evidence_required     BOOLEAN NOT NULL DEFAULT false,
    owner_role_title      VARCHAR(100) NOT NULL,
    start_date            DATE,
    target_date           DATE,
    baseline_period_code  VARCHAR(10) REFERENCES cmp_periods(code) ON DELETE RESTRICT,
    notes                 TEXT,
    created_by            UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ,
    CONSTRAINT uq_cmpitems_code UNIQUE (factor_id, item_code),
    CONSTRAINT chk_cmpitems_scoringmethod CHECK (scoring_method IN ('Stage','Binary','Approval','KPI','Manual'))
);
COMMENT ON TABLE cmp_items IS 'Tracking Items — the leaf level of the hierarchy (source: 01_PLAN_SETUP). overall_weight (workstream.weight x initiative.weight x factor.weight x item.weight) is computed at read time, never stored, per the "official percentages must be deterministic" rule. Application layer must enforce SUM(weight) = 1.0 among items within a factor. critical_gate=true means high readiness elsewhere cannot override this item being incomplete (TC07 in TECH_03_ACCEPTANCE_TESTS).';

-- Progress state for a Tracking Item (source: 02_PROGRESS_UPDATE, 1:1 with
-- cmp_items). Score, weighted contribution, variance and RAG are computed at
-- read time in lib/cmp/calculations.ts, replicating the tracker's exact
-- formulas (TECH_02_SCORING_AND_RAG) — never stored, per "AI/system must not
-- invent scores; deterministic backend calculates official results."
CREATE TABLE cmp_item_updates (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id                     UUID NOT NULL REFERENCES cmp_items(id) ON DELETE CASCADE,
    current_status              VARCHAR(30),
    approval_status             VARCHAR(30),
    kpi_target                  NUMERIC(15,4),
    kpi_actual                  NUMERIC(15,4),
    manual_score                NUMERIC(5,4),
    manual_score_justification  TEXT,
    forecast_date                DATE,
    evidence_status              VARCHAR(20) NOT NULL DEFAULT 'Not Required',
    critical_blocker             BOOLEAN NOT NULL DEFAULT false,
    blocker_issue                TEXT,
    support_required             TEXT,
    remarks                      TEXT,
    updated_by                   UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cmpitemupdates_item UNIQUE (item_id),
    CONSTRAINT chk_cmpitemupdates_evidencestatus CHECK (evidence_status IN ('Not Required','Pending','Submitted','Verified')),
    CONSTRAINT chk_cmpitemupdates_manualscore CHECK (manual_score IS NULL OR manual_score BETWEEN 0 AND 1),
    CONSTRAINT chk_cmpitemupdates_manualjustification CHECK (manual_score IS NULL OR manual_score_justification IS NOT NULL)
);
COMMENT ON TABLE cmp_item_updates IS 'Owner-updated progress state, one row per item. current_status/approval_status hold whichever value set applies for the item''s scoring_method (validated at the application layer against TECH_02_SCORING_AND_RAG''s tables, not a DB CHECK, since the valid set depends on a sibling row''s scoring_method). Evidence-required items cannot score 100% while evidence_status != Verified.';

CREATE INDEX idx_cmpworkstreams_planid ON cmp_workstreams(plan_id);
CREATE INDEX idx_cmpinitiatives_workstreamid ON cmp_initiatives(workstream_id);
CREATE INDEX idx_cmpfactors_initiativeid ON cmp_factors(initiative_id);
CREATE INDEX idx_cmpitems_factorid ON cmp_items(factor_id);
CREATE INDEX idx_cmpitemupdates_itemid ON cmp_item_updates(item_id);
