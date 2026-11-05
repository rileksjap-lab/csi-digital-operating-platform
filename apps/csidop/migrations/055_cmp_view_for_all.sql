-- ════════════════════════════════════════════════════════════════════════════
-- Migration 055: CMP — every role can open the Transformation Plan (view)
-- Depends on: 052 (adds 'cmp' to the allowed ModuleCode list)
--
-- Decision: everyone in CSI can see the Transformation Plan. Migration 052 seeded
-- the roles that existed then; this adds a view row for any role that has none,
-- such as the SVP role added later. Roles that already have a row keep it, so
-- HOD, Solution Manager and Team Lead stay at full. Editing is still controlled
-- by cmp_role_capabilities, not by this view setting.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, 'cmp', 'view' FROM role r
ON CONFLICT (roleid, modulecode) DO NOTHING;
