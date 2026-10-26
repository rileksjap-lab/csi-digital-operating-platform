-- Migration 046: a separate KPI role per person
-- A person's ROLE decides what they can do in CSIDOP (create and assign work
-- orders, see all pods ...). Some people hold a higher role only for that access
-- (for example a Pre-Sales Executive who also coordinates work orders as a Team
-- Lead or Solution Manager). The KPI appraisal must follow their real job, not
-- their access role: the appraisal form, the reviewer chain and the KPI authority
-- (setup, opening appraisals, finalising, HR report) come from KpiRoleId when it
-- is set, and from RoleId when it is not. NULL = same as the normal role.

ALTER TABLE STAFF ADD COLUMN KpiRoleId UUID REFERENCES ROLE(Id) ON DELETE RESTRICT;
COMMENT ON COLUMN STAFF.KpiRoleId IS 'Role used by the KPI appraisal module when it differs from the access role (RoleId); NULL means the same as RoleId';
