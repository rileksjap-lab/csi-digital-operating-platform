# CMP Web Dashboard Prototype — Assessment

Source: `CSI_CMP_Web_Dashboard_Prototype_v1.zip` → `csi_cmp_web_prototype/` (7 files: `index.html`, `app.js`, `styles.css`, `data/cmp-data.js`, `assets/logo-placeholder.svg`, `DATA_MAPPING.md`, `README.md`).

Per your instruction, this is assessed as a **UI/functional reference only** — not a source of truth for data or architecture. It is a static, single-page, no-build, no-framework HTML/CSS/JS app with one hardcoded JS data file (`window.CMP_DATA = {...}`) standing in for a real backend. It was built by ChatGPT as a rough visual mockup, and its own `README.md` says as much (`"Recommended CSIDOP integration: 1. Move data/cmp-data.js into API responses... 2. Convert views into Next.js components... 3. Store CMP data in PostgreSQL tables."`) — i.e. the prototype's own documentation already tells you not to keep it as-is.

## What it is

- **9 client-side "pages"**, swapped via `goTo(pageId)` innerHTML replacement (no router, no server calls): Executive Dashboard, Quarterly S-Curve, KPI Scorecard, Break-Even, Business Pillars, Risk Register, Company Readiness, Decision Log, Presentation Mode.
- **One data file** (`cmp-data.js`, ~100 lines) holding the entire dataset as a JS object literal — the same sample figures already reviewed in the Excel assessment (35% baseline, 40% Y1 Q1 actual, same 5 risks, same 8 readiness areas, same 6 decisions... though note it lists **6** decisions here vs. **3** in the Excel and **10** in the slide deck — a third, different count, reinforcing the finding in the Excel assessment that the decision log is incomplete/inconsistent across all three source artifacts and needs to be reconciled once, not migrated from any single one blindly).
- **A hand-rolled inline SVG line chart** (`drawSCurve()`, ~25 lines) plotting Planned vs Actual — no charting library. Reimplementing this as a proper chart (e.g. via a lightweight React charting approach consistent with the rest of CSIDOP) is trivial and should not reuse this code directly.
- **RAG badges** via a `ragBadge()` string-matching helper (`status.includes('green')` etc.) — same computed-vs-stored issue as the Excel: status strings are pre-baked into the data file rather than derived from actual-vs-target at render time.
- **"Presentation Mode"** — a slide-by-slide replay of the Chairman's Briefing deck content baked into the JS, plus a browser print-to-PDF button. This is the one genuinely distinct *feature idea* worth carrying forward (see functional mapping) — a live "present this dashboard as a deck" mode, generated from the same live data rather than a separately maintained slide file.
- **Visual styling**: navy/red/white palette explicitly described as "10CS-inspired" (`styles.css` header comment) — worth a quick visual comparison against CSIDOP's actual current navy/red theme (already established in an earlier session) before assuming it matches; it's a guess by the prototype's author, not sourced from a real brand asset (the one image asset is `assets/logo-placeholder.svg`, a placeholder, not the real 10CS logo).

## What to reuse (UI/UX reference value)

- **Page/section inventory** — the 9 pages map cleanly onto the module list already scoped from the Excel + deck (Executive Dashboard, S-Curve, KPI Scorecard, Break-Even, Business Pillars, Risk Register, Company Readiness, Decision Log). This confirms the functional scope rather than expanding it — good sanity check, no new requirements discovered here.
- **Dashboard "4 KPI cards + chart + management messages" layout** (`renderDashboard()`) — a reasonable executive-summary layout worth carrying into the real Next.js component, adapted to CSIDOP's existing card/dashboard conventions rather than copied verbatim.
- **"Presentation Mode"** as a concept — worth considering as a real CSIDOP feature (render the Executive Dashboard data as a full-screen slide sequence + PDF export), since it directly answers the deck's own stated pain point (slide 31: "true auto-refresh requires PowerPoint linked objects... this deck is prepared for periodic Excel-driven refresh") — CSIDOP can actually solve that problem properly instead of working around it.

## What NOT to reuse

- **No backend, no persistence, no auth, no validation** — by design (it's a static mockup), so there's nothing to port at the data or logic layer, only at the visual layer.
- **The hardcoded `CMP_DATA` object should not become a seed/fixture file** for the real system — it's the same illustrative sample data as the Excel, already captured and reconciled in the Excel assessment; using this file as a second, slightly-different copy of the same samples would just reintroduce the 3-way decision-log-count inconsistency noted above.
- **Plain CSS/vanilla JS patterns** (manual `innerHTML` templating, no component model) — don't carry these patterns into Next.js/React; rebuild each view as a proper typed component per CSIDOP's existing conventions.
- **The RAG-by-string-matching helper** — same "computed, not stored" principle from the Excel assessment applies; don't port `ragBadge()`'s "trust whatever status string is baked into the data" behaviour into a system where RAG should be derived server-side.

## Net assessment

This prototype does its intended job — it proves the module's information architecture (9 views, what data each needs) and offers a couple of reusable UI ideas (dashboard layout, presentation mode) — but contributes **nothing** to the schema, the data model, or the backend. Deliverables 3–5 (mapping, functional mapping, schema) are driven entirely by the Excel assessment and the slide deck, not by this prototype. Recommend keeping this zip only as a throwaway visual reference during frontend build-out, not as a checked-in artifact in the CSIDOP repo.
