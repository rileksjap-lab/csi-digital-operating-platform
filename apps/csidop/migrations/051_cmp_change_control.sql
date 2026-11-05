-- ════════════════════════════════════════════════════════════════════════════
-- Migration 051: CMP Hierarchy Engine — Baseline Change Control
-- Reference: master prompt hierarchy list ("... -> Change Request -> Audit
--            History"), REQUIRED MODULES #16 "Baseline Change Control"
-- Table: cmp_change_requests
-- Depends on: staff, cmp_plans (047)
-- ════════════════════════════════════════════════════════════════════════════

-- Once a plan's baseline_status moves to Locked/Approved, structural fields
-- (weight, scoring_method, critical_gate, evidence_required on items; weight
-- on workstreams/initiatives/factors) become read-only at the application
-- layer except through an approved Change Request — this table is that
-- approval trail. entity_type/entity_id point at whichever hierarchy row is
-- being changed; a generic reference rather than one FK per possible target
-- table, since any level of the hierarchy can be the subject of a change.
CREATE TABLE cmp_change_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES cmp_plans(id) ON DELETE CASCADE,
    entity_type     VARCHAR(30) NOT NULL,
    entity_id       UUID NOT NULL,
    field_name      VARCHAR(100) NOT NULL,
    old_value       TEXT,
    new_value       TEXT NOT NULL,
    reason          TEXT NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'Pending',
    requested_by    UUID NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_by     UUID REFERENCES staff(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    CONSTRAINT chk_cmpchangereq_entitytype CHECK (entity_type IN ('workstream','initiative','factor','item')),
    CONSTRAINT chk_cmpchangereq_status CHECK (status IN ('Pending','Approved','Rejected')),
    CONSTRAINT chk_cmpchangereq_approved CHECK ((status = 'Pending') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
COMMENT ON TABLE cmp_change_requests IS 'Approval trail for structural edits to a locked/approved baseline (weight, scoring_method, critical_gate, evidence_required). Applying an Approved request is an application-layer action that both updates the target row and leaves this record intact as history — the request itself is never deleted or overwritten.';

CREATE INDEX idx_cmpchangereq_planid ON cmp_change_requests(plan_id);
CREATE INDEX idx_cmpchangereq_entity ON cmp_change_requests(entity_type, entity_id);
CREATE INDEX idx_cmpchangereq_status ON cmp_change_requests(status);
