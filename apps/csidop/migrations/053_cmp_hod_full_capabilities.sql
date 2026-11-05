-- ════════════════════════════════════════════════════════════════════════════
-- Migration 053: CMP — HOD gets unrestricted access to every capability
-- Reference: user decision 2026-08 ("create HOD can do all unlimited"),
--            supersedes the strict SM/HOD split originally seeded in
--            migration 052 per docs/cmp-transformation/10_solution_design.md
--            section 2 (Workstream Owner / CMP Administrator / Plan Owner
--            split modelled after the tracker's named roles).
-- Depends on: role, cmp_role_capabilities (052)
--
-- 052 seeded HOD with only the "Plan Owner" slice of capabilities
-- (approve_baseline, lock_plan, override_critical_gate, record_decisions,
-- close_issues, manage_periods, manage_role_capabilities) on the theory
-- that hierarchy construction (manage_hierarchy, manage_weights, ...) was
-- CMP Administrator / SolutionManager's job, mirroring separate roles the
-- master prompt names. The user wants HOD unrestricted instead -- this
-- grants every capability_code in the CHECK constraint to HOD, additively
-- (SolutionManager keeps everything it already had; nothing is revoked
-- from any role here).
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO cmp_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM role r
CROSS JOIN (VALUES
    ('manage_role_capabilities'), ('manage_periods'),
    ('manage_hierarchy'), ('manage_weights'),
    ('approve_baseline'), ('lock_plan'), ('override_critical_gate'),
    ('manage_workstream_items'), ('update_progress'), ('update_item_progress'),
    ('verify_evidence'),
    ('edit_revenue_model'), ('verify_financial_assumptions'),
    ('manage_healthcare_workstream'),
    ('record_decisions'), ('close_issues')
) AS c(code)
WHERE r.rolecode = 'HOD'
ON CONFLICT (role_id, capability_code) DO NOTHING;
