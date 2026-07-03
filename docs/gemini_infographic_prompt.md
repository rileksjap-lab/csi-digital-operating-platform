# Gemini Infographic Prompt — CSI Digital Operating Platform (CSIDOP) Full Workflow

Copy and paste this into Google Gemini to generate the infographic.

---

Create a professional, modern infographic for "CSI Digital Operating Platform (CSIDOP)" — an internal operating system used by the Consultant, Solution & Innovation (CSI) department at 10 Creative Solutions Sdn Bhd (10CS).

## Design Style
- Clean, modern corporate infographic style
- Color scheme: Primary blue (#2563EB), accent teal (#0D9488), white backgrounds, light gray sections
- Use icons/pictograms for each module
- Flowchart arrows to show process flow
- Professional typography, easy to read
- Layout: landscape A3 or wide poster format
- Include the title "CSI Digital Operating Platform" at the top with subtitle "End-to-End Digital Workflow"

## Platform Overview (Top Section)
Show a horizontal banner with:
- Platform name: **CSI Digital Operating Platform (CSIDOP)**
- Tagline: "One platform replacing SharePoint, Excel, Word & BPM spreadsheets"
- URL: csidop.10creativesolutions.com
- Tech: Next.js + PostgreSQL + Redis
- 4 User Roles (as role badges): HOD (Head of Department), Solution Manager, Team Lead, Staff

## Main Workflow Modules (Show as connected flow sections)

### 1. USER ACCESS & AUTHENTICATION
- Staff registers with company email
- Admin approves registration
- OTP verification via email
- Role-based access: HOD > Solution Manager > Team Lead > Staff
- Row-level security (Department → Stream → Pod → Self scope)

### 2. DASHBOARD (Home)
- KPI Scoreboard: Total WOs, Open, In Progress, Closed, Overdue
- Monthly WO by Request Type (stacked bar chart)
- WO by Status (donut chart)
- Quick links to all modules
- Real-time data refresh

### 3. WO INBOX (Incoming Work)
Two tabs:
- **Incoming (External)**: WOs from other departments (CMT, CSA, CPO, CBA, CST, CSO, CGI) via EWM system or email polling
- **Internal (CSI)**: WOs created within CSI department
- Email auto-polling for new WOs
- Quick filters: Open, In Progress, Pending, Closed
- Pagination with cursor-based navigation

### 4. WORK ORDER (WO) MANAGEMENT (Core Module)
**WO Creation Flow:**
1. HOD/SM/TL creates WO → auto-generates WO number (300-DDMMYYYY-NNN)
2. Select: Request Type, Complexity Tier, Priority (Critical/High/Normal/Low), Domain
3. Set: Due Date, SLA Working Days, Source of WO, Remark
4. System auto-populates Task Checklist from templates

**WO Lifecycle (Status Flow):**
```
Open → Acknowledged → In Progress → Pending Approval → Approved → Closed
                                   ↘ Returned (with reason) → back to In Progress
                        ↘ Cancelled (with reason)
```

**WO Detail Features:**
- Overview: all WO fields, remark, SLA badge
- Task Checklist: configurable per Request Type, progress tracking (0-100%)
- Assignment History: who was assigned when
- Effort Log: hours logged per staff
- Evidence/Deliverables: file uploads with soft-delete
- Approval Trail: approval workflow history
- Actions: Assign, Edit, Mark Complete, Return, Cancel

**Request Types (13 types across 6 domains):**
- Solution Design: Tender/RFP, Leads/Opportunity
- Consultancy: Physical, Non-Physical, Tender Briefing
- BIM: Presales Total Solution, Postsales Total Solution
- Project Monitoring
- Google CP: GCP Activities
- Others: Documentation, Events/Trainings

### 5. WO PROGRESS TRACKING
- Visual progress bars per WO
- Task-level completion tracking
- SLA monitoring with color-coded badges (On Track / Due Soon / Overdue)
- Filter by status, domain, assignee

### 6. MY TASKS
- Personal task view for logged-in staff
- Tasks assigned across all WOs
- Quick status updates and progress entry

### 7. WORKLOADS VIEW
- Domain-tabbed view: Solution Design, Consultancy, BIM, Project Monitoring, Google CP, Others
- Cross-department workload visibility
- Capacity overview per domain

### 8. CAPACITY PLANNING
- Staff capacity vs allocated hours
- Go/No-Go evaluation for new work
- Resource utilization tracking
- HOD override with mandatory reason logging

### 9. KPI DASHBOARD
- Department-level KPIs
- Individual staff performance metrics
- SLA compliance rates
- Evidence-based KPI tracking
- Scoreboard cards with large numbers

### 10. SKILLS & CERTIFICATIONS
- Staff skills inventory
- Certification tracking and expiry alerts
- Skill-based resource matching

### 11. TENDERS
- Tender pipeline tracking
- Tender lifecycle management
- Technical scoring
- Go/No-Go committee decisions (HOD CSI + HOD CMT)

### 12. REPORTS
- Management reporting
- Export capabilities
- Trend analysis

### 13. ADMIN PANEL (System Configuration)
- Staff Management: approve/reject registrations, manage roles
- Role Permissions: configure access per role
- Request Types & SLA: manage 13 request types with SLA days
- **Task Templates**: configurable checklist templates per request type (staff can manage without code changes)
- Complexity Tiers: Tier 1-5 with multiplier factors
- Baseline Tiers & Multiplier Factors
- Role Split: percentage allocation per department (must sum to 100%)
- Audit Log: immutable, hash-chained activity log (INSERT+SELECT only)

## Bottom Section — Key Platform Rules
Show as a highlighted rules bar:
- ✓ No local passwords — SSO/OTP only
- ✓ Audit log is immutable (INSERT+SELECT only)
- ✓ Staff never hard-deleted (Active/Inactive/OnLeave)
- ✓ Evidence files use soft-delete
- ✓ WO numbers auto-generated, never user input
- ✓ Row-level security enforced server-side
- ✓ Role-split must sum to 100% per department

## Footer
- Company: 10 Creative Solutions Sdn Bhd (10CS)
- Department: Consultant, Solution & Innovation (CSI)
- Platform: CSI Digital Operating Platform v1.0
- Built with: Next.js, PostgreSQL, Redis
