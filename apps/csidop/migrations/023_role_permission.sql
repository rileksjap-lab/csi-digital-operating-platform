-- ════════════════════════════════════════════════════════════════════════════
-- Migration 023: Role Permission (module-level access control)
-- Allows admins to configure which roles can access which modules.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE ROLE_PERMISSION (
    Id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    RoleId      UUID NOT NULL REFERENCES ROLE(Id) ON DELETE CASCADE,
    ModuleCode  VARCHAR(30) NOT NULL,
    AccessLevel VARCHAR(10) NOT NULL DEFAULT 'none',
    CreatedAt   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UpdatedAt   TIMESTAMPTZ,
    CONSTRAINT uq_role_permission UNIQUE (RoleId, ModuleCode),
    CONSTRAINT chk_rp_access CHECK (AccessLevel IN ('none','view','full')),
    CONSTRAINT chk_rp_module CHECK (ModuleCode IN (
        'dashboard','work_orders','wo_inbox','wo_progress','my_tasks',
        'workloads','capacity','kpi','skills','reports','admin'
    ))
);
COMMENT ON TABLE ROLE_PERMISSION IS 'Module-level access control per role: none/view/full';

-- Seed default permissions for existing roles
-- HOD: full access to everything
INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, m.code, 'full'
FROM role r
CROSS JOIN (VALUES
    ('dashboard'),('work_orders'),('wo_inbox'),('wo_progress'),('my_tasks'),
    ('workloads'),('capacity'),('kpi'),('skills'),('reports'),('admin')
) AS m(code)
WHERE r.rolecode = 'HOD';

-- SM: full access to everything including admin
INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, m.code, 'full'
FROM role r
CROSS JOIN (VALUES
    ('dashboard'),('work_orders'),('wo_inbox'),('wo_progress'),('my_tasks'),
    ('workloads'),('capacity'),('kpi'),('skills'),('reports'),('admin')
) AS m(code)
WHERE r.rolecode = 'SM';

-- TL: full access to most, view-only on capacity/reports, no admin
INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, m.code, m.level
FROM role r
CROSS JOIN (VALUES
    ('dashboard','full'),('work_orders','full'),('wo_inbox','full'),
    ('wo_progress','full'),('my_tasks','full'),('workloads','full'),
    ('capacity','view'),('kpi','view'),('skills','full'),
    ('reports','view'),('admin','none')
) AS m(code, level)
WHERE r.rolecode = 'TL';

-- TM: limited access
INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, m.code, m.level
FROM role r
CROSS JOIN (VALUES
    ('dashboard','view'),('work_orders','view'),('wo_inbox','none'),
    ('wo_progress','full'),('my_tasks','full'),('workloads','view'),
    ('capacity','view'),('kpi','view'),('skills','full'),
    ('reports','none'),('admin','none')
) AS m(code, level)
WHERE r.rolecode = 'TM';

-- BIM_TL: same as TL
INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, m.code, m.level
FROM role r
CROSS JOIN (VALUES
    ('dashboard','full'),('work_orders','full'),('wo_inbox','full'),
    ('wo_progress','full'),('my_tasks','full'),('workloads','full'),
    ('capacity','view'),('kpi','view'),('skills','full'),
    ('reports','view'),('admin','none')
) AS m(code, level)
WHERE r.rolecode = 'BIM_TL';

-- BIM_MOD: same as TM
INSERT INTO role_permission (roleid, modulecode, accesslevel)
SELECT r.id, m.code, m.level
FROM role r
CROSS JOIN (VALUES
    ('dashboard','view'),('work_orders','view'),('wo_inbox','none'),
    ('wo_progress','full'),('my_tasks','full'),('workloads','view'),
    ('capacity','view'),('kpi','view'),('skills','full'),
    ('reports','none'),('admin','none')
) AS m(code, level)
WHERE r.rolecode = 'BIM_MOD';

-- ── Seed capacity & system settings into SYSTEM_SETTING ────────────────────

INSERT INTO system_setting (settingkey, settingvalue, description) VALUES
    ('capacity.daily_usable_hours', '7', 'Default daily usable hours per staff'),
    ('capacity.working_days_per_month', '22', 'Standard working days per month'),
    ('capacity.band_free_max', '50', 'Utilization % upper bound for Free band'),
    ('capacity.band_safe_max', '75', 'Utilization % upper bound for Safe band'),
    ('capacity.band_warning_max', '90', 'Utilization % upper bound for Warning band'),
    ('capacity.dept_threshold', '85', 'Department utilization threshold %'),
    ('wo.number_prefix', '300', 'Prefix for CSI WO number generation'),
    ('notification.wo_assigned', 'true', 'Send email when WO is assigned'),
    ('notification.wo_reassigned', 'true', 'Send email when WO is reassigned'),
    ('notification.wo_pending_approval', 'true', 'Send email when WO is pending approval'),
    ('notification.wo_approved', 'true', 'Send email when WO is approved'),
    ('notification.wo_returned', 'true', 'Send email when WO is returned'),
    ('notification.wo_from_email', 'true', 'Send email when WO imported from email'),
    ('notification.sla_breach_warning', 'true', 'Send email when WO SLA is about to breach'),
    ('notification.registration_pending', 'true', 'Send email when new registration is pending')
ON CONFLICT (settingkey) DO NOTHING;
