# CSI Digital Operating Platform — Project Context

This file is read automatically by Claude Code at the start of every session.
It summarizes the project so context never needs to be re-explained.

## What This Project Is

An internal operating platform for the Consultant, Solution & Innovation (CSI)
department at 10 Creative Solutions Sdn Bhd (10CS), replacing four
disconnected manual tools (SharePoint, Excel, Word, BPM spreadsheet) with a
single system for work order management, resource capacity planning, tender
pipeline tracking, KPI evidence, skills/certification management, and
management reporting.

## Source Documents (in /docs)

Read these in this order before making architecture decisions — each one
builds on the last and is the authoritative source for its domain:

1. **BRS.docx** — Business Requirement Specification. Business case, 15
   business requirements (BR-01–15), business rules (BRL-01–08). KRISA
   Business Architecture domain.
2. **SRS.docx** — System Requirement Specification. System requirements
   across all 5 KRISA domains (Business/Information/Application/Technology/
   Security), each traced back to a BR and forward to PRD functional
   requirements.
3. **PRD.docx** — Product Requirements Document v1.1. The full functional
   requirement catalogue (FR-01 to FR-61), scope, roles, 16-section spec.
   This is the primary reference for "what does feature X need to do."
4. **UIUX_Wireframe_Spec.docx** — All 19 screens, each with layout,
   components, actions, validation rules, data displayed, navigation flow.
5. **Database_Design_Spec.docx** — The authoritative schema: 25 tables, ERD,
   field-level data dictionary, relationships, indexes, audit log design.
   **The /migrations folder is the executable implementation of this spec
   and has already been tested against live PostgreSQL — start from there,
   don't regenerate the schema from scratch.**
6. **SAD.docx** — System Architecture Design. Tech stack (Next.js + FastAPI +
   PostgreSQL), deployment topology, security architecture, 16 Mermaid
   diagrams.
7. **API_Spec.docx** — Full REST API contract: 10 route groups, ~50
   endpoints, request/response schemas, error codes, pagination conventions.
   Use this as the source of truth for API route shape — don't improvise
   endpoint contracts.

## What's Already Built

- **`/migrations`** — 13 PostgreSQL migrations + 2 seed scripts, all
  individually tested against a live PostgreSQL 16 instance. Run
  `./migrations/run_all.sh <dbname>` to stand up the full schema. See
  `migrations/README.md` for what was tested and two real bugs that were
  found and fixed (partitioned-table primary keys, and an audit-log
  immutability gap on new partitions — both documented inline).
- **`/prototype`** — A high-fidelity, clickable frontend-only prototype
  (`CSI_Digital_Operating_Platform_Prototype.jsx` / `.html`) covering 14 of
  the 19 screens, with realistic sample data matching the documented domain
  (work orders, tenders, staff, certifications). React + Tailwind + Chart.js,
  no backend. Treat this as a visual/UX reference when building the real
  screens, not as production code to import directly — it uses local mock
  state, not real API calls.

## Tech Stack (per SAD §3, §16.1)

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Backend API:** Next.js API Routes (BFF pattern)
- **Compute worker:** FastAPI (Python) — for capacity calculations, tender
  scoring, Go/No-Go projections (PRD §13)
- **Database:** PostgreSQL 16 (schema already built — see /migrations)
- **Cache/sessions:** Redis
- **Auth:** OIDC SSO via Microsoft Entra ID or Google Workspace — no local
  passwords, ever (SR-SEC-01)
- **No ORM** — node-postgres (pg) with parameterised queries, to preserve
  query control (Database Design Spec §1.4)

## Key Architectural Rules to Respect

These are non-negotiable patterns established across the documentation —
don't silently deviate from them:

- **Row-level scope is server-enforced**, never only in the UI. Every API
  route must apply the caller's role-based scope filter (Department / Stream
  / Pod / Self) at the repository layer, not trust the frontend (SAD §5).
- **AUDIT_LOG is INSERT+SELECT only** for the application database role.
  Never grant UPDATE/DELETE to it, including on new partitions — migration
  013 enforces this automatically via an event trigger. Don't bypass it.
- **STAFF rows are never hard-deleted.** Deactivation is a `Status` change
  (`Active`/`Inactive`/`OnLeave`), never a DELETE.
- **Evidence files use soft-delete** (`RemovedAt`/`RemovedBy`), never hard
  delete.
- **CSI_WO_No, TenderNo, ExtWO_No are auto-generated**, never accepted as
  user input on create.
- **Role-split percentages must sum to exactly 100% per department** —
  validate this before any save to `ROLE_SPLIT`.
- **A capacity Go/No-Go override is HOD-only and requires a logged reason**
  — both must be present together or neither (see the CHECK constraint on
  `GONOGO_EVALUATION` in migration 007).

## Current Phase

Migrations are built and tested. Next step is scaffolding the actual Next.js
+ FastAPI application against this schema and the API Specification.
No application code exists yet — this is a clean start on the codebase.
