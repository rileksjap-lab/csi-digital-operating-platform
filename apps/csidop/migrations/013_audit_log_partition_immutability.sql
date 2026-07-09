-- ════════════════════════════════════════════════════════════════════════════
-- Migration 013: Automatic Partition Immutability Enforcement
-- Reference: Database Design Specification v1.0 §6.3 (Immutability & Tamper-Evidence)
--            System Architecture Design v1.0 §9 (Audit Trail Architecture)
--
-- WHY THIS MIGRATION EXISTS
-- PostgreSQL does NOT automatically propagate a partitioned table's GRANT
-- restrictions to partitions created after that GRANT was issued (verified
-- empirically during development of this migration set — a freshly created
-- partition inherits the schema's ALTER DEFAULT PRIVILEGES setting instead,
-- which is broader than what AUDIT_LOG requires). Without this migration,
-- every new monthly AUDIT_LOG partition — whether created manually or by
-- pg_partman — would silently reopen UPDATE/DELETE access for csidop_app,
-- defeating the immutability guarantee for that month's data until someone
-- noticed and manually re-applied the restricted grant.
--
-- This migration closes that gap permanently using a PostgreSQL event
-- trigger: any CREATE TABLE that creates a new partition of AUDIT_LOG is
-- automatically locked down to INSERT+SELECT only, with no dependency on a
-- human remembering to do it.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enforce_audit_log_partition_immutability()
RETURNS event_trigger AS $$
DECLARE
    obj RECORD;
BEGIN
    FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands() LOOP
        IF obj.command_tag = 'CREATE TABLE' THEN
            -- Only act if the newly created relation is a partition whose
            -- parent is AUDIT_LOG (covers both manual partition creation and
            -- pg_partman-managed creation, since both ultimately issue a
            -- CREATE TABLE ... PARTITION OF statement that fires this trigger).
            IF EXISTS (
                SELECT 1
                FROM pg_inherits i
                JOIN pg_class parent ON i.inhparent = parent.oid
                JOIN pg_class child  ON i.inhrelid  = child.oid
                WHERE child.oid = obj.objid
                  AND parent.relname = 'audit_log'
            ) THEN
                EXECUTE format('GRANT INSERT, SELECT ON %s TO csidop_app', obj.object_identity);
                EXECUTE format('REVOKE UPDATE, DELETE ON %s FROM csidop_app', obj.object_identity);
                RAISE NOTICE 'Audit log immutability auto-enforced on new partition: %', obj.object_identity;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_audit_log_partition_immutability() IS
    'DB Spec §6.3 — automatically restricts every new AUDIT_LOG partition to INSERT+SELECT for csidop_app, closing the gap where PostgreSQL does not propagate a parent table''s GRANT restrictions to partitions created after that GRANT was issued';

-- Event triggers are database-wide (not schema-scoped) and require superuser
-- or a role with the appropriate privilege to create; this migration must be
-- run by an administrative role (see README.md, "Running the Migrations").
DROP EVENT TRIGGER IF EXISTS trg_enforce_audit_log_immutability;
CREATE EVENT TRIGGER trg_enforce_audit_log_immutability
    ON ddl_command_end
    WHEN TAG IN ('CREATE TABLE')
    EXECUTE FUNCTION enforce_audit_log_partition_immutability();

COMMENT ON EVENT TRIGGER trg_enforce_audit_log_immutability IS
    'Fires on every CREATE TABLE; the trigger function itself filters to AUDIT_LOG partitions only, so this does not affect any other table creation in the schema';

-- Apply the lockdown retroactively to every partition that already exists
-- (the four monthly partitions plus the default partition created in
-- migration 011), since the event trigger only catches partitions created
-- AFTER this migration runs.
DO $$
DECLARE
    part RECORD;
BEGIN
    FOR part IN
        SELECT child.relname
        FROM pg_inherits i
        JOIN pg_class parent ON i.inhparent = parent.oid
        JOIN pg_class child  ON i.inhrelid  = child.oid
        WHERE parent.relname = 'audit_log'
    LOOP
        EXECUTE format('GRANT INSERT, SELECT ON %I TO csidop_app', part.relname);
        EXECUTE format('REVOKE UPDATE, DELETE ON %I FROM csidop_app', part.relname);
    END LOOP;
END $$;
