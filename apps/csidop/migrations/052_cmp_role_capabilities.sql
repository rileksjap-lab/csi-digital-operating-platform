-- ════════════════════════════════════════════════════════════════════════════
-- Migration 052: CMP Role Capabilities (fine-grained action permissions)
-- Reference: documents/Claude_CSIDOP_CMP_Integration_Master_Prompt_v1.3
--            ("ROLES" section — 12 tracker roles mapped onto CSIDOP's real
--            Role enum), docs/cmp-transformation/10_solution_design.md §2
-- Tables: cmp_role_capabilities (new)
-- Alters: role_permission (adds 'cmp' as a valid ModuleCode)
-- Depends on: role (existing), role_permission (023)
--
-- Two-layer capability model, per the 2026-07-31 decision "map [tracker]
-- roles onto existing roles + capability flags, don't touch core
-- auth/STAFF/ROLE tables":
--   1. Module-level access (view/full/none on the whole 'cmp' module) —
--      reuses the existing ROLE_PERMISSION table, just adds 'cmp' to its
--      allowed ModuleCode list. No new mechanism needed for this layer.
--   2. Fine-grained action capabilities (e.g. "can verify evidence" vs
--      "can edit revenue model" — both need module access=full, but are
--      different capabilities) — this migration's new
--      cmp_role_capabilities table, same RoleId-keyed shape as
--      ROLE_PERMISSION so it reads the same way to future maintainers.
-- ════════════════════════════════════════════════════════════════════════════

-- Widen ROLE_PERMISSION's ModuleCode check to allow 'cmp'. Postgres has no
-- ALTER CHECK; drop and recreate with the same name.
ALTER TABLE role_permission DROP CONSTRAINT chk_rp_module;
ALTER TABLE role_permission ADD CONSTRAINT chk_rp_module CHECK (ModuleCode IN (
    'dashboard','work_orders','wo_inbox','wo_progress','my_tasks',
    'workloads','capacity','kpi','skills','reports','admin','cmp'
));

CREATE TABLE cmp_role_capabilities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id         UUID NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    capability_code VARCHAR(40) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_cmprolecapabilities UNIQUE (role_id, capability_code),
    CONSTRAINT chk_cmprolecapabilities_code CHECK (capability_code IN (
        'manage_role_capabilities', 'manage_periods',
        'manage_hierarchy', 'manage_weights',
        'approve_baseline', 'lock_plan', 'override_critical_gate',
        'manage_workstream_items', 'update_progress', 'update_item_progress',
        'verify_evidence',
        'edit_revenue_model', 'verify_financial_assumptions',
        'manage_healthcare_workstream',
        'record_decisions', 'close_issues'
    ))
);
COMMENT ON TABLE cmp_role_capabilities IS 'Fine-grained CMP action permissions, keyed by role (not by staff), same admin-configurable pattern as ROLE_PERMISSION but for actions a blunt view/full module toggle cannot express -- e.g. a Workstream Owner and an Evidence Reviewer both need cmp module access=full, but only one should hold verify_evidence. See docs/cmp-transformation/10_solution_design.md section 2 for the full tracker-role -> CSIDOP-role -> capability mapping this was seeded from.';

CREATE INDEX idx_cmprolecapabilities_roleid ON cmp_role_capabilities(role_id);

-- ── Seed: 'cmp' module access (ROLE_PERMISSION) ─────────────────────────
-- HOD and SM get full; TL/BIM_TL get full (workstream/initiative-owner
-- level work); TM/BIM_MOD get view (item-owner level -- their own item
-- edits are gated by update_item_progress below, not by module access).

INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, 'cmp', 'full' FROM role r WHERE r.rolecode IN ('HOD','SM','TL','BIM_TL')
ON CONFLICT (roleid, modulecode) DO UPDATE SET accesslevel = EXCLUDED.accesslevel;

INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, 'cmp', 'view' FROM role r WHERE r.rolecode IN ('TM','BIM_MOD')
ON CONFLICT (roleid, modulecode) DO UPDATE SET accesslevel = EXCLUDED.accesslevel;

-- ── Seed: fine-grained capabilities, per 10_solution_design.md §2 ──────
-- HOD: Plan Owner + Management Sponsor + Decision Owner + System
-- Administrator capabilities (HOD is CSIDOP's top departmental role).
INSERT INTO cmp_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM role r
CROSS JOIN (VALUES
    ('manage_role_capabilities'),('manage_periods'),
    ('approve_baseline'),('lock_plan'),('override_critical_gate'),
    ('record_decisions'),('close_issues')
) AS c(code)
WHERE r.rolecode = 'HOD'
ON CONFLICT DO NOTHING;

-- SM: CMP Administrator + Finance Reviewer + Decision Owner capabilities.
INSERT INTO cmp_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM role r
CROSS JOIN (VALUES
    ('manage_hierarchy'),('manage_weights'),
    ('edit_revenue_model'),('verify_financial_assumptions'),
    ('record_decisions'),('close_issues'),
    ('manage_healthcare_workstream')
) AS c(code)
WHERE r.rolecode = 'SM'
ON CONFLICT DO NOTHING;

-- TL / BIM_TL: Workstream/Initiative Owner + Evidence Reviewer +
-- Healthcare Business Lead capabilities (any TL may be assigned as the
-- Healthcare workstream owner via cmp_owners; the capability just makes
-- it possible, cmp_owners.accountable_owner scopes it to the right person).
INSERT INTO cmp_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM role r
CROSS JOIN (VALUES
    ('manage_workstream_items'),('update_progress'),
    ('verify_evidence'),('manage_healthcare_workstream')
) AS c(code)
WHERE r.rolecode IN ('TL','BIM_TL')
ON CONFLICT DO NOTHING;

-- TM / BIM_MOD: Item Owner capability only -- own items, own progress.
INSERT INTO cmp_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM role r
CROSS JOIN (VALUES
    ('update_item_progress')
) AS c(code)
WHERE r.rolecode IN ('TM','BIM_MOD')
ON CONFLICT DO NOTHING;
