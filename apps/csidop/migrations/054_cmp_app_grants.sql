-- ════════════════════════════════════════════════════════════════════════════
-- Migration 054: CMP — grant the application role access to the CMP tables
-- Depends on: 047–053 (cmp_* tables)
--
-- The app connects as csidop_app, which only receives access to tables that are
-- granted explicitly. Migrations 047–053 create the CMP tables without grants,
-- so this one gives csidop_app the usual CRUD on every cmp_* table. Generated
-- columns need no extra grant. Idempotent, and a no-op where the role does not
-- exist (a fresh development database that runs as the table owner).
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    tbl text;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csidop_app') THEN
        FOR tbl IN
            SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'cmp\_%'
        LOOP
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO csidop_app', tbl);
        END LOOP;
    END IF;
END $$;
