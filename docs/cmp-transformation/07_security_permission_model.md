# Security and Permission Model (deliverable 11)

Formalizes the access model from design discussion (already partly reflected in the schema's `CMP_PUBLIC_SHARE_LINK` tables) into a concrete role/permission matrix. No new security infrastructure — extends the existing guard/session/audit system exactly as every other CSIDOP module does.

## Two tiers, restated precisely

1. **In-app, authenticated** — every logged-in CSIDOP user, any department, any role, can **read** the full CMP module (not just an Executive subset — that restriction is specific to tier 2 below). They're identified, sessioned, and every read is attributable if ever needed; there's no reason to narrow what an authenticated peer HOD or Finance staff member can see.
2. **Public, unauthenticated** (`/cmp/public/:token`) — for people with no CSIDOP account at all. Read-only, and narrowed to the **Executive subset only**: Executive Dashboard (scorecard), S-Curve, KPI Scorecard, Readiness Gate. Structurally excludes risk mitigation text, decision remarks/outcomes, action-log detail, and every financial figure.

## Role matrix (in-app, tier 1)

| Role | Read | Edit governance (milestones/risks/actions/decisions/issues) | Edit financials (break-even/shadow P&L) | Manage share link | Manage plan config |
|---|---|---|---|---|---|
| HOD CSI | ✅ | ✅ (all) | ✅ | ✅ | ✅ |
| CSI: SolutionManager / TeamLead / BIMTeamLead | ✅ | ✅ (own-owned records — see below) | ❌ | ❌ | ❌ |
| CSI: TeamMember | ✅ | ✅ (own-owned records only) | ❌ | ❌ | ❌ |
| Finance role | ✅ | ❌ | ✅ | ❌ | ❌ |
| Any other authenticated role (CMT, other departments, etc.) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Admin | ✅ | ✅ (all) | ✅ | ✅ | ✅ |

"Own-owned records" — since owners are free-text role titles (decision #4), not `staff` FKs, "own" is determined by matching the editor's role against the record's `OwnerRoleTitle` (e.g. a `TeamLead` can edit a milestone owned by `"HOD CSI / CBA"` only if their role appears in that string, otherwise it's HOD-only) — a looser check than a strict FK match would allow, intentionally, since ownership here is organisational rather than a single named individual. This mirrors the existing WO assignee-or-role-in-list pattern already used for the WO task-checklist permission check (`TASK_CREATE_ROLES.includes(session.role) || wo.assignedTo === session.staffId`) — same shape, adapted for a role-string match instead of a staff-ID match.

**BIM-tagged Work Orders** — since BIM tracking extends `CSI_WO` (decision #1) rather than a new table, editing `CmpQaQcStatus`/`CmpRevenueAttributed` on a WO uses the **existing WO edit permission check**, not a new CMP-specific one. No new permission logic needed there — it inherits whatever already governs WO edits.

## Guard implementation

`lib/auth/guards.ts` gains two new functions, following the exact shape of the existing `requireAuth`/`requireRole`:

```typescript
requireCmpRead(request)          // any authenticated session — used by every CMP GET route
requireCmpGovernanceEdit(request, ownerRoleTitle)  // HOD/Admin always pass; SolutionManager/TeamLead/BIMTeamLead/TeamMember pass only if their role appears in ownerRoleTitle
requireCmpFinanceEdit(request)   // HOD CSI, Finance role, Admin only
requireCmpAdmin(request)         // HOD CSI, Admin only — share-link management, plan config
```

Every CMP API route applies the appropriate guard server-side — never trusting a frontend `canEdit` flag alone, per the existing CSIDOP rule (SAD §5) and per the exact bug this session already found and fixed once this session for WO task creation (frontend/backend permission checks must match exactly, or the mismatch becomes a real bug users hit).

## Public share-link security

- **Token generation**: cryptographically random, ≥32 bytes, base64url-encoded — generated server-side only (`crypto.randomBytes`), never user-chosen.
- **No enumeration surface**: the public route returns an identical 404 for "token doesn't exist" and "token was revoked" — doesn't leak which case it is.
- **Rate limiting**: per-IP throttling on `/api/cmp/public/[token]` using the existing Redis instance (a simple sliding-window counter, same pattern Redis is already available for) — protects against token brute-forcing given tokens, while long, are still guessable in enough attempts without a rate limit.
- **No write surface reachable from this route at all** — not "checked and denied," but literally no mutating endpoint exists under `/api/cmp/public/*`. A route that doesn't exist can't have a broken permission check.
- **Revocation**: HOD CSI/Admin can revoke (`RevokedAt`/`RevokedBy`) and generate a fresh token at any time — e.g. rotating before/after each Chairman briefing if that feels appropriate, though it's not required.
- **Access logging**: every hit to the public route writes a `CMP_PUBLIC_SHARE_ACCESS_LOG` row (IP, timestamp, user-agent) even though the viewer is anonymous — consistent with CSIDOP's audit-everything posture, and gives HOD CSI visibility into how much the link is actually being used.

## Audit logging

No new audit infrastructure. Every CMP table insert/update flows through the existing `audit_log` (immutable, hash-chained, `INSERT+SELECT`-only grant) exactly like every other CSIDOP table — this requires the new CMP tables to be added to the `op_tables` array in `seed/000_app_role.sql` (or an equivalent follow-up grant) when the real migration is written, the same mechanical step every past module's tables went through.

## What's deliberately *not* new here

- No new session/JWT mechanism — CMP uses the exact same session cookie as every other module for tier 1.
- No new database role — `csidop_app` gets the same broad SELECT/INSERT/UPDATE/DELETE grant on the new CMP tables as it already has on every operational table; row-level scope enforcement stays entirely at the application layer, per the existing architecture.
- No local password mechanism for the public link — it's a bearer-token URL (possession-based), not an account, so SR-SEC-01 ("no local passwords, ever") isn't in tension with it; it's a different access model entirely, scoped narrowly enough (read-only, Executive-subset-only, revocable, logged) that the tradeoff is deliberate and contained.
