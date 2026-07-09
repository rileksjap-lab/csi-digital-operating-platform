-- ════════════════════════════════════════════════════════════════════════════
-- Seed 000: Application Database Role
-- Reference: System Architecture Design v1.0 §7 (Database Architecture)
--            Database Design Specification v1.0 §6.3 (Immutability & Tamper-Evidence)
--
-- Run this BEFORE migration 011 (AUDIT_LOG) in a fresh environment, so the
-- REVOKE/GRANT statements in that migration have a role to act on. In this
-- reference implementation it is provided as a separate seed script (rather
-- than folded into 001_extensions.sql) because role/credential provisioning
-- is typically owned by infrastructure/DevOps, not the schema migration
-- pipeline — see SAD §14 (Deployment Architecture).
--
-- IMPORTANT: the password below is a placeholder for local development only.
-- In staging/production, the password must come from the secrets manager
-- (Kubernetes Secrets / Vault, per SAD §12) and never be committed to source
-- control.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csidop_app') THEN
        CREATE ROLE csidop_app WITH LOGIN PASSWORD 'CHANGE_ME_VIA_SECRETS_MANAGER';
    END IF;
END $$;

-- Baseline grants: the application role needs full CRUD on all operational
-- tables (enforced further by RBAC/row-level scope at the application layer,
-- SAD §5 — this database-level grant is necessarily coarser than that).
--
-- AUDIT_LOG is deliberately EXCLUDED from this broad grant. It receives its
-- own, narrower grant (INSERT + SELECT only) below, because granting it
-- UPDATE/DELETE here — even temporarily — would defeat the immutability
-- guarantee that is this table's entire purpose (DB Spec §6.3). This is
-- handled directly in this script (rather than relying on migration 011 to
-- run afterward and revoke it again) so the correct end-state does not
-- depend on script run order.
DO $$
DECLARE
    tbl text;
    op_tables text[] := ARRAY[
        'department','role','request_type','baseline_tier','multiplier_factor',
        'system_setting','complexity_tier','staff','external_wo','tender',
        'csi_wo','assignment','effort_log','evidence_deliverable','approval_record',
        'tender_scoring','gonogo_evaluation','kpi_record','oi_tracker',
        'skill','staff_skill','certification','training_plan','role_split'
    ];
BEGIN
    FOREACH tbl IN ARRAY op_tables LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO csidop_app', tbl);
    END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO csidop_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO csidop_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO csidop_app;

-- AUDIT_LOG: INSERT + SELECT only — see DB Spec §6.3, SAD §9. This table may
-- not yet exist if this seed script is run before migration 011 in a fresh
-- environment; the IF EXISTS guard makes this script safe to run in either
-- order. Migration 011 also re-asserts this same grant for the reverse
-- ordering case, so the end state is correct regardless of which runs first.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
        EXECUTE 'GRANT INSERT, SELECT ON AUDIT_LOG TO csidop_app';
        EXECUTE 'REVOKE UPDATE, DELETE ON AUDIT_LOG FROM csidop_app';
    END IF;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO csidop_app;

-- DELETE is intentionally still granted broadly here, even though DB Spec
-- §1.4 establishes a soft-delete-only convention for STAFF and EVIDENCE_DELIVERABLE.
-- That convention is an application-layer discipline (the API never issues a
-- DELETE statement against those tables), not a database-level lock, because
-- a small number of genuinely disposable tables (e.g. draft/unconfirmed
-- upload-intent records, if added in a later phase) may legitimately need
-- hard deletes. AUDIT_LOG is the one table where immutability IS enforced at
-- the database level — see the REVOKE statement in migration 011, which
-- this seed script's GRANT above predates and which therefore correctly wins
-- (run migration 011 after this seed, or re-run its REVOKE block, in any
-- environment where grants were applied out of order).
