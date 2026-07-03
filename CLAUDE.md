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

- **`/migrations`** — 30 PostgreSQL migrations + seed scripts, tested against
  a live PostgreSQL 16 instance. Run `./migrations/run_all.sh <dbname>` to
  stand up the full schema. See `migrations/README.md` for what was tested.
  Beyond the original 25-table spec, later migrations added: OTP/registration,
  notifications, WO discussion threads, announcements, task templates, role
  permissions, and misc data fixes (department names, usable hours, etc.).
- **`/prototype`** — The original frontend-only clickable prototype. Superseded
  by the real app in `/src`; kept for historical UX reference only.
- **`/src`** — The real Next.js application (see below).
- **`/worker`** — FastAPI compute worker scaffold (capacity/tender scoring).

### Application modules (in `/src/app`)

- **Auth** — SSO login (dev bypass when OIDC unconfigured), self-registration
  with admin approval + OTP verification
- **Work Orders** — inbox (external/internal tabs), list, detail, create,
  assign, effort logging, evidence upload (soft-delete), approvals, cancel,
  discussion threads w/ @mentions, email digest, progress view, task
  templates per request type
- **Tenders** — pipeline list/detail/create
- **Capacity** — workload summaries, per-staff capacity view
- **KPI**, **Skills** (certifications/assessments/training), **Calendar**,
  **Announcements**, **Notifications**, **Reports**, **Profile**
- **Admin** — departments, roles, permissions, role-split, complexity tiers,
  multiplier factors, request types, task templates, pending-staff approval,
  audit log viewer

Remaining wireframe screens and FRs not yet built should be checked against
`UIUX_Wireframe_Spec.docx` and `PRD.docx` rather than assumed complete.

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
- **CSIDOP is multi-department**: CSI now, CMT later. Sidebar/modules are
  fully department-scoped (not the same menu with filtered data). Shared
  modules: Tender Pipeline view, Go/No-Go, Executive Dashboard. Build
  CSI-only modules first (CSI WOs, CSI Capacity, Skills & Cert, KPI &
  Evidence); CMT modules (Tender Intake, Commercial/Pricing, Submission
  Tracking) come later.
- **Tender ownership is split**: CMT owns intake/commercial/submission; CSI
  owns technical (solution design, effort, technical writeup). Go/No-Go is
  decided by a joint committee (HOD CSI + HOD CMT). CSI's Tender module
  should stay read-only pipeline view + Go/No-Go record + link to WO — don't
  build tender create/edit for CSI users.
- **Work orders originate in EWM** (org-wide Extended Work Management
  system used by all departments), not in CSIDOP. Two WO types: **External**
  (from EWM, has an External WO Number — currently registered manually,
  EWM API sync pending) and **Internal** (created directly in CSIDOP by CSI
  HOD/Manager for internal initiatives/R&D/training — the WO create form
  is a permanent feature for this, not a placeholder).

## Current Phase

Application scaffolding is done and under active development. Auth, Work
Orders (the core module), Tenders, Capacity, KPI, Skills, Calendar,
Announcements, Notifications, Reports, Profile, and Admin all have working
frontend + API + DB layers. Recent work has focused on WO pagination, SLA
calculation correctness, evidence upload, and UI polish (login page
redesign). Treat this as an actively evolving app, not a clean-start
scaffold — check `/src/app` directly for what exists before assuming a
screen or endpoint is missing.
