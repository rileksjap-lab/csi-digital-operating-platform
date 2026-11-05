-- ════════════════════════════════════════════════════════════════════════════
-- Migration 048: CMP Hierarchy Engine — Evidence, Issues/Decisions/Blockers
-- Reference: TECH_01_DATA_DICTIONARY, 03_ISSUES_DECISIONS
-- Tables: cmp_evidence, cmp_issue_log
-- Depends on: staff, cmp_plans, cmp_items (047)
-- ════════════════════════════════════════════════════════════════════════════

-- Evidence workflow (source: 02_PROGRESS_UPDATE's Evidence Status column,
-- expanded into a real entity per the master prompt's "Evidence Control"
-- section — file/reference, submitter, reviewer, date, status, comments).
-- An item's evidence_required=true + evidence_status must reach Verified
-- here before the item's computed score can reach 100% (app-layer rule).
CREATE TABLE cmp_evidence (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id         UUID NOT NULL REFERENCES cmp_items(id) ON DELETE CASCADE,
    file_reference  TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'Submitted',
    submitted_by    UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by     UUID REFERENCES staff(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    comments        TEXT,
    CONSTRAINT chk_cmpevidence_status CHECK (status IN ('Submitted','Verified','Rejected')),
    CONSTRAINT chk_cmpevidence_reviewed CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL))
);
COMMENT ON TABLE cmp_evidence IS 'Evidence submissions per item. "AI must not verify evidence" per the master prompt — reviewed_by must always be a real staff member, never a system/AI actor.';

-- Unified issue/decision/blocker log (source: 03_ISSUES_DECISIONS — one
-- sheet, one ID sequence, a Type column distinguishing Issue/Decision/
-- Blocker, plus decision- and recovery-specific columns already present on
-- every row regardless of type). Modelled as one table matching the actual
-- source sheet, not three separate tables — the abstract hierarchy text in
-- the master prompt names Issue/Decision/Recovery Action as distinct
-- concepts, but the tracker's own real implementation treats them as one log
-- with a discriminator, which is the structure actually being used operationally.
CREATE TABLE cmp_issue_log (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id                 UUID NOT NULL REFERENCES cmp_plans(id) ON DELETE CASCADE,
    log_code                VARCHAR(20) NOT NULL,
    type                    VARCHAR(20) NOT NULL,
    related_item_id         UUID REFERENCES cmp_items(id) ON DELETE SET NULL,
    workstream_label        VARCHAR(200),
    description             TEXT NOT NULL,
    severity                VARCHAR(20) NOT NULL DEFAULT 'Medium',
    owner_role_title        VARCHAR(100) NOT NULL,
    opened_date             DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date                DATE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'Open',
    impact                  TEXT,
    support_required        TEXT,
    decision_required       TEXT,
    decision_owner_role_title VARCHAR(100),
    recovery_action         TEXT,
    close_date              DATE,
    created_by              UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cmpissuelog_code UNIQUE (log_code),
    CONSTRAINT chk_cmpissuelog_type CHECK (type IN ('Issue','Decision','Blocker')),
    CONSTRAINT chk_cmpissuelog_severity CHECK (severity IN ('Low','Medium','High','Critical')),
    CONSTRAINT chk_cmpissuelog_closedate CHECK ((status != 'Closed') OR (close_date IS NOT NULL))
);
COMMENT ON TABLE cmp_issue_log IS 'Unified issue/decision/blocker register (source: 03_ISSUES_DECISIONS). "Overdue management decision" (type=Decision, status=Open, due_date < today) is one of the RAG-Red triggers per TECH_02_SCORING_AND_RAG.';

CREATE INDEX idx_cmpevidence_itemid ON cmp_evidence(item_id);
CREATE INDEX idx_cmpissuelog_planid ON cmp_issue_log(plan_id);
CREATE INDEX idx_cmpissuelog_relateditemid ON cmp_issue_log(related_item_id);
CREATE INDEX idx_cmpissuelog_type ON cmp_issue_log(type);
CREATE INDEX idx_cmpissuelog_status ON cmp_issue_log(status);
