-- ════════════════════════════════════════════════════════════════════════════
-- Migration 011: Audit Log (Immutable Compliance Ledger)
-- Reference: Database Design Specification v1.0 §3.25, §6 (Audit Log Design)
--            System Architecture Design v1.0 §9 (Audit Trail Architecture)
-- Table: AUDIT_LOG
-- Depends on: STAFF
-- ════════════════════════════════════════════════════════════════════════════

-- DB Spec §6: "The platform-wide, immutable compliance ledger ... INSERT-only
-- — the application's database role has no UPDATE or DELETE grant on this
-- table, enforced at the database level." Range-partitioned by PerformedAt
-- at the calendar-month boundary (DB Spec §6.4).
CREATE TABLE AUDIT_LOG (
    Id              BIGSERIAL NOT NULL,
    EntityName      VARCHAR(50) NOT NULL,
    EntityId        UUID NOT NULL,
    Action          VARCHAR(20) NOT NULL,
    FieldName       VARCHAR(100),
    OldValue        TEXT,
    NewValue        TEXT,
    Reason          TEXT,
    PerformedBy     UUID NOT NULL REFERENCES STAFF(Id) ON DELETE RESTRICT,
    PerformedAt     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ChecksumHash    VARCHAR(64) NOT NULL,
    CONSTRAINT pk_auditlog PRIMARY KEY (Id, PerformedAt),
    CONSTRAINT chk_auditlog_action CHECK (Action IN
        ('Insert','Update','StatusChange','Approve','Return','Override','Export','Delete'))
) PARTITION BY RANGE (PerformedAt);
COMMENT ON TABLE AUDIT_LOG IS 'DB Spec §6, SAD §9 — immutable, hash-chained compliance ledger. EntityName/EntityId is intentionally not FK-enforced (polymorphic across all governed tables)';
COMMENT ON COLUMN AUDIT_LOG.Id IS 'Primary key is composite (Id, PerformedAt) because PostgreSQL requires the partition key as part of any unique constraint; BIGSERIAL still gives a strictly increasing sequence for chain verification';
COMMENT ON COLUMN AUDIT_LOG.EntityId IS 'PK of the affected row in EntityName''s table — not FK-enforced because a single column cannot reference 24 different parent tables; the nightly integrity check (SAD §9) validates entity existence separately';
COMMENT ON COLUMN AUDIT_LOG.ChecksumHash IS 'SHA-256 of PreviousHash + row content (DB Spec §6.3); computed by the application layer''s audit interceptor before INSERT, using pgcrypto digest() is also acceptable if computed via a trigger — see note below';

-- Monthly partitions, covering the go-live window. See migration 015 for the
-- pg_partman-based automated partition maintenance approach recommended for
-- production (DB Spec §6.4).
CREATE TABLE audit_log_2026_06 PARTITION OF AUDIT_LOG FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_log_2026_07 PARTITION OF AUDIT_LOG FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_log_2026_08 PARTITION OF AUDIT_LOG FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_log_2026_09 PARTITION OF AUDIT_LOG FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_log_default PARTITION OF AUDIT_LOG DEFAULT;

CREATE INDEX idx_auditlog_entity ON AUDIT_LOG(EntityName, EntityId);
CREATE INDEX idx_auditlog_performedat ON AUDIT_LOG(PerformedAt);
CREATE INDEX idx_auditlog_performedby ON AUDIT_LOG(PerformedBy);

-- ── Immutability enforcement (DB Spec §6.3) ─────────────────────────────────
-- The application's runtime database role (csidop_app) must never be able to
-- UPDATE or DELETE rows in AUDIT_LOG, even via a bug or a compromised
-- credential. This is enforced here at the database level, not left to
-- application-layer discipline alone.
--
-- This statement is run against the application role created during
-- environment provisioning (see seed/000_roles.sql). If that role does not
-- yet exist in the target environment, run seed/000_roles.sql first.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'csidop_app') THEN
        EXECUTE 'REVOKE UPDATE, DELETE ON AUDIT_LOG FROM csidop_app';
        EXECUTE 'GRANT INSERT, SELECT ON AUDIT_LOG TO csidop_app';
    END IF;
END $$;
