-- ════════════════════════════════════════════════════════════════════════════
-- Migration 001: Extensions
-- CSI Digital Operating Platform — Database Migrations
-- Reference: Database Design Specification v1.0 §1.3 (Data Type Conventions)
-- ════════════════════════════════════════════════════════════════════════════

-- pgcrypto: provides gen_random_uuid() for surrogate UUID primary keys (DB Spec §1.4)
-- and the digest()/SHA-256 functions used by the AUDIT_LOG hash chain (DB Spec §6.3).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgAudit: statement-level audit logging at the PostgreSQL engine level,
-- catching any direct database access that bypasses the application layer
-- (DB Spec §7, SAD §9). This satisfies the MAMPU/KRISA audit requirement
-- as a defence-in-depth layer beneath the application-level AUDIT_LOG table.
-- NOTE: pgAudit requires the extension package to be installed on the server
-- (postgresql-16-pgaudit on Debian/Ubuntu) and shared_preload_libraries='pgaudit'
-- set in postgresql.conf, which requires a server restart. This statement is
-- included for completeness; if the extension package is not present on a given
-- environment, comment this line out and configure pgAudit at the infrastructure
-- provisioning stage instead (see SAD §14, Deployment Architecture).
-- CREATE EXTENSION IF NOT EXISTS pgaudit;
