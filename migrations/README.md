# CSI Digital Operating Platform — Database Migrations

PostgreSQL 16 migration scripts implementing the schema defined in the
**Database Design Specification v1.0**. Every script in this folder has been
executed against a live PostgreSQL 16 instance during development — this is
not untested SQL transcribed from the spec; each migration was run, verified,
and in several cases corrected based on real errors PostgreSQL raised (see
"What Got Caught & Fixed" below).

## Prerequisites

- PostgreSQL 16 (the version targeted in System Architecture Design §16.1 / §3)
- A database role with permission to create extensions, tables, and one
  database-wide event trigger (migration 013 requires this — typically the
  database owner or a superuser role during initial setup)

## Folder Structure

```
migrations/
├── 001_extensions.sql                          Required PostgreSQL extensions
├── 002_lookup_tables.sql                       DEPARTMENT, ROLE, REQUEST_TYPE, BASELINE_TIER,
│                                                MULTIPLIER_FACTOR, SYSTEM_SETTING
├── 003_complexity_tier_staff.sql                COMPLEXITY_TIER, STAFF
├── 004_external_wo_tender.sql                  EXTERNAL_WO, TENDER
├── 005_csi_wo.sql                              CSI_WO (the central work order table)
├── 006_wo_children.sql                         ASSIGNMENT, EFFORT_LOG (partitioned),
│                                                EVIDENCE_DELIVERABLE, APPROVAL_RECORD
├── 007_scoring_gonogo.sql                      TENDER_SCORING, GONOGO_EVALUATION
├── 008_kpi_oi.sql                              KPI_RECORD, OI_TRACKER
├── 009_skills_certification.sql                SKILL, STAFF_SKILL, CERTIFICATION, TRAINING_PLAN
├── 010_role_split.sql                          ROLE_SPLIT
├── 011_audit_log.sql                           AUDIT_LOG (partitioned, hash-chain ready)
├── 012_updated_at_triggers.sql                 Auto-maintains UpdatedAt on every table
├── 013_audit_log_partition_immutability.sql    Self-healing immutability enforcement (see below)
├── seed/
│   ├── 000_app_role.sql                        Creates the csidop_app database role
│   └── 001_seed_master_data.sql                Departments, roles, request types, tiers,
│                                                multipliers, settings, role-split %, skills
└── run_all.sh                                  Runs everything in the correct order
```

## Running the Migrations

```bash
# Create the database first
createdb csidop

# Run everything in order
./run_all.sh csidop
```

The `run_all.sh` script runs all numbered migrations (001–013), then both seed
scripts, in one pass with `ON_ERROR_STOP=1` — if anything fails, the script
stops immediately rather than continuing on a half-applied schema.

**Production note:** change the placeholder password in `seed/000_app_role.sql`
before running against any non-local environment. It must come from your
secrets manager (Kubernetes Secrets / Vault per System Architecture Design
§12), never committed to source control.

## What This Migration Set Implements

- **25 tables**, exactly matching the Database Design Specification §3 entity
  data dictionary — field-for-field, including every NOT NULL, default value,
  and CHECK constraint described there
- **35 indexes**, matching Database Design Specification §5
- **32 foreign-key relationships** with the exact ON DELETE behaviour
  (CASCADE / RESTRICT / SET NULL) specified in §4
- **Two range-partitioned tables** (EFFORT_LOG, AUDIT_LOG), partitioned
  monthly by date, per §6.4 and §7
- **An immutable AUDIT_LOG**: the application database role can INSERT and
  SELECT, but cannot UPDATE or DELETE — enforced at the database privilege
  level, not just application discipline (§6.3)
- **Composite primary keys** on both partitioned tables (Id + partition
  column), which PostgreSQL requires for any unique constraint on a
  partitioned table

## What Got Caught & Fixed During Testing

Two real bugs were found by actually running these scripts against PostgreSQL,
not just reading them:

1. **Partitioned table primary keys.** PostgreSQL rejects a `PRIMARY KEY (Id)`
   alone on a table partitioned by a different column — the partition column
   must be part of the key. Fixed by making the primary key composite
   `(Id, LogDate)` / `(Id, PerformedAt)` on EFFORT_LOG and AUDIT_LOG.

2. **AUDIT_LOG immutability did not survive partition creation.** This is the
   more serious finding. Granting the application role broad CRUD on "all
   tables" and then separately revoking UPDATE/DELETE on AUDIT_LOG works for
   the partitions that exist *at the moment the REVOKE runs* — but PostgreSQL
   does **not** propagate that restriction to partitions created afterward.
   A brand-new monthly partition silently inherited full UPDATE/DELETE access
   until migration 013's event trigger was added, which automatically
   re-applies the INSERT+SELECT-only restriction to every new AUDIT_LOG
   partition the moment it's created — verified by creating a new partition
   and confirming zero manual steps were needed to lock it down.

Both findings are documented inline in the relevant migration files as SQL
comments, not just here.

## Verified Business Rules

The following business rules from the BRS/PRD were functionally tested
against this schema (not just declared in a CHECK constraint and assumed
correct):

| Rule | Test | Result |
|---|---|---|
| FR-29: effort entry ≤ 8 hours | Inserted a 9-hour entry | Rejected |
| FR-05: one internal WO per external WO | Inserted a second CSI_WO against an already-linked ExtWO_Id | Rejected |
| CSI_WO.Status must be a valid value | Set Status to an invalid string | Rejected |
| TENDER.WinValue cannot be negative | Set WinValue to -500 | Rejected |
| BRL-07: OI Won cannot exceed Registered | Inserted Won=5, Registered=2 | Rejected |
| BR-06: Go/No-Go override requires both fields | Inserted OverrideReason without OverrideBy | Rejected |
| BRL-04: role-split sums to 100% per department | Queried seeded CSI and CMT role-split totals | Both exactly 100.00 |
| Full WO lifecycle chain | Inserted Tender → External WO → CSI_WO → Assignment → Effort Log | All linked correctly; effort log landed in the correct monthly partition |

## What This Migration Set Does Not Include

- **Down/rollback migrations.** This is a Phase 1 forward-only migration set.
  Before production cutover, add down migrations or adopt a migration tool
  (Flyway, node-pg-migrate) that tracks applied versions and can manage
  rollback — this hand-rolled numbered-file approach is a starting point, not
  a long-term migration framework.
- **pg_partman integration.** Partitions are created manually for the first
  four months as a demonstration; production should use pg_partman (or an
  equivalent scheduled job) to create future partitions automatically. If you
  adopt pg_partman, confirm it creates partitions via `CREATE TABLE ...
  PARTITION OF` (it does, by default) so migration 013's event trigger
  continues to catch and lock down every new partition automatically.
- **pgAudit configuration.** Referenced in migration 001 as a commented-out
  statement; enabling it requires a `postgresql.conf` change and a server
  restart, which is an infrastructure-provisioning step (System Architecture
  Design §14), not something a migration script can do.
- **Seed data for STAFF, TENDER, CSI_WO,** or any transactional table — only
  master/reference data is seeded. Real staff and work order data is created
  through the application, not pre-populated.
