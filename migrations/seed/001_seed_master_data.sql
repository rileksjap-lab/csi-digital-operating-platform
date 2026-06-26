-- ════════════════════════════════════════════════════════════════════════════
-- Seed 001: Master / Reference Data
-- Reference: PRD v1.1 §4.1 (Scope), §6 (User Roles), §13.1–13.3 (Capacity
--            Planning Logic); Database Design Specification v1.0 §3
--
-- Populates every lookup/configuration table with the values already
-- established in CSI's operating model (PRD §2.1) — this is configuration
-- data the business already uses today, not invented defaults.
-- ════════════════════════════════════════════════════════════════════════════

-- ── DEPARTMENT (PRD §4.2) ───────────────────────────────────────────────────
INSERT INTO DEPARTMENT (DeptCode, DeptName) VALUES
    ('CSI', 'Consultant, Solution & Innovation'),
    ('CMT', 'Capacity Management Team'),
    ('CPO', 'Corporate Project Office'),
    ('CGI', 'Corporate Governance & Integrity'),
    ('CSA', 'Corporate Strategy & Alliances'),
    ('CBA', 'Corporate Business Academy')
ON CONFLICT (DeptCode) DO NOTHING;

-- ── ROLE (PRD §6) ────────────────────────────────────────────────────────────
INSERT INTO ROLE (RoleCode, RoleName, CapacityScope) VALUES
    ('HOD',     'Head of Department',  'Department'),
    ('SM',      'Solution Manager',    'Stream'),
    ('TL',      'Team Lead',           'Pod'),
    ('TM',      'Team Member',         'Self'),
    ('BIM_TL',  'BIM Team Lead',       'Pod'),
    ('BIM_MOD', 'BIM Modeler',         'Self')
ON CONFLICT (RoleCode) DO NOTHING;

-- ── REQUEST_TYPE (PRD §4.1 — 12-type taxonomy with default SLA targets per FR-32) ──
INSERT INTO REQUEST_TYPE (TypeCode, TypeName, Domain, SlaAckDays, SlaClassifyDays, SlaRouteDays) VALUES
    (1,  'Leads / Opportunity',         'Solution Design',     1, 2, 3),
    (2,  'Tender / RFP',                'Solution Design',     1, 2, 3),
    (3,  'Documentation',               'Solution Design',     1, 2, 3),
    (4,  'Physical Consultancy',        'Consultancy',         1, 2, 3),
    (5,  'Non-Physical Consultancy',    'Consultancy',         1, 2, 3),
    (6,  'BIM Presales ICT',            'BIM',                 1, 2, 3),
    (7,  'BIM Presales Total Solution', 'BIM',                 1, 2, 3),
    (8,  'BIM Presales Management',     'BIM',                 1, 2, 3),
    (9,  'BIM Postsales ICT',           'BIM',                 1, 2, 3),
    (10, 'BIM Postsales Total Solution','BIM',                 1, 2, 3),
    (11, 'BIM Postsales Management',    'BIM',                 1, 2, 3),
    (12, 'Project Monitoring',          'Project Monitoring',  1, 2, 3)
ON CONFLICT (TypeCode) DO NOTHING;

-- ── COMPLEXITY_TIER (PRD §7.10, FR-33 — approval routing by tier) ──────────
INSERT INTO COMPLEXITY_TIER (TierCode, TierName, ApproverRoleId)
SELECT 1, 'Tier 1', Id FROM ROLE WHERE RoleCode = 'TL'
ON CONFLICT (TierCode) DO NOTHING;
INSERT INTO COMPLEXITY_TIER (TierCode, TierName, ApproverRoleId)
SELECT 2, 'Tier 2', Id FROM ROLE WHERE RoleCode = 'SM'
ON CONFLICT (TierCode) DO NOTHING;
INSERT INTO COMPLEXITY_TIER (TierCode, TierName, ApproverRoleId)
SELECT 3, 'Tier 3', Id FROM ROLE WHERE RoleCode = 'HOD'
ON CONFLICT (TierCode) DO NOTHING;

-- ── BASELINE_TIER (PRD §13.3 — default baseline hour allocation per tender size) ──
INSERT INTO BASELINE_TIER (TierSize, BaselineCSIHours, BaselineCMTHours) VALUES
    ('Small',  65.00,  20.00),
    ('Medium', 100.00, 35.00),
    ('Large',  200.00, 70.00),
    ('Mega',   320.00, 110.00)
ON CONFLICT (TierSize) DO NOTHING;

-- ── MULTIPLIER_FACTOR (PRD §13.3, FR-38 — default complexity multipliers) ──
INSERT INTO MULTIPLIER_FACTOR (FactorCode, MultiplierValue) VALUES
    ('Rush',          1.25),
    ('Consortium',    1.15),
    ('SecurityHeavy', 1.20),
    ('CustomDev',     1.30),
    ('ManyQA',        1.10),
    ('Onsite',        1.10)
ON CONFLICT (FactorCode) DO NOTHING;

-- ── SYSTEM_SETTING (PRD §13.1–13.4, §7.15 FR-53 — default configurable thresholds) ──
INSERT INTO SYSTEM_SETTING (SettingKey, SettingValue, Description) VALUES
    ('CSI_UTILIZATION_THRESHOLD',      '85',  'CSI department utilization threshold percentage (PRD §13.2)'),
    ('CMT_UTILIZATION_THRESHOLD',      '80',  'CMT department utilization threshold percentage (PRD §13.2)'),
    ('UTILIZATION_BAND_SAFE_MIN',      '50',  'Lower bound (%) of the Safe utilization band (PRD §13.2)'),
    ('UTILIZATION_BAND_WARNING_MIN',   '85',  'Lower bound (%) of the Warning utilization band (PRD §13.2)'),
    ('UTILIZATION_BAND_OVERLOADED_MIN','90',  'Lower bound (%) of the Overloaded utilization band (PRD §13.2)'),
    ('DEFAULT_WORKING_HOURS_PER_DAY',  '8',   'Standard working hours per day before productivity factor is applied (PRD §13.1)'),
    ('GONOGO_PLANNING_HORIZON_DAYS',   '10',  'Default planning horizon for Go/No-Go capacity projection (PRD §13.4, FR-39)'),
    ('CERT_EXPIRY_WINDOW_DAYS',        '90',  'Default certification expiry alert window (PRD §7.15, FR-53)'),
    ('AUDIT_LOG_RETENTION_YEARS',      '7',   'Audit log retention period, aligned to ISO 9001 / PDPA / MAMPU-KRISA requirements (DB Spec §6.4)'),
    ('HOD_ANNUAL_OI_REGISTERED_TARGET','8',   'HOD role annual Opportunity of Interest registered target (BRL-07)'),
    ('HOD_ANNUAL_OI_WON_TARGET',       '3',   'HOD role annual Opportunity of Interest won target (BRL-07)'),
    ('TL_ANNUAL_OI_REGISTERED_TARGET', '3',   'Team Lead role annual Opportunity of Interest registered target (BRL-07)'),
    ('TL_ANNUAL_OI_WON_TARGET',        '1',   'Team Lead role annual Opportunity of Interest won target (BRL-07)')
ON CONFLICT (SettingKey) DO NOTHING;

-- ── ROLE_SPLIT (PRD §13.3, FR-49 — default role-split percentages, must sum to 100% per department) ──
-- CSI department split
INSERT INTO ROLE_SPLIT (DeptId, RoleId, Percentage)
SELECT d.Id, r.Id, v.pct
FROM DEPARTMENT d, ROLE r,
    (VALUES ('HOD',5.00), ('SM',15.00), ('TL',25.00), ('TM',40.00), ('BIM_TL',7.00), ('BIM_MOD',8.00)) AS v(rolecode, pct)
WHERE d.DeptCode = 'CSI' AND r.RoleCode = v.rolecode
ON CONFLICT (DeptId, RoleId) DO NOTHING;

-- CMT department split
INSERT INTO ROLE_SPLIT (DeptId, RoleId, Percentage)
SELECT d.Id, r.Id, v.pct
FROM DEPARTMENT d, ROLE r,
    (VALUES ('HOD',5.00), ('SM',20.00), ('TL',30.00), ('TM',45.00)) AS v(rolecode, pct)
WHERE d.DeptCode = 'CMT' AND r.RoleCode = v.rolecode
ON CONFLICT (DeptId, RoleId) DO NOTHING;

-- ── SKILL (PRD §7.15 — starter skills inventory across the 8 technology domains) ──
INSERT INTO SKILL (SkillName, TechnologyDomain) VALUES
    ('AWS Solutions Architecture',     'Cloud'),
    ('Google Cloud Platform',          'Cloud'),
    ('Microsoft Azure',                'Cloud'),
    ('Network Security',               'Cyber Security'),
    ('Penetration Testing',            'Cyber Security'),
    ('Server Virtualization',          'Data Centre'),
    ('Storage Architecture',           'Data Centre'),
    ('Cisco Routing & Switching',      'Network'),
    ('SD-WAN',                         'Network'),
    ('TOGAF Enterprise Architecture',  'Enterprise Architecture'),
    ('Solution Architecture',          'Enterprise Architecture'),
    ('Machine Learning Operations',    'AI / HPC'),
    ('GPU Cluster Architecture',       'AI / HPC'),
    ('BIM Coordination',               'BIM'),
    ('Revit Modelling',                'BIM'),
    ('Tender Writing',                 'Consultancy'),
    ('Client Presentation',            'Consultancy')
ON CONFLICT (SkillName, TechnologyDomain) DO NOTHING;
