# CSI DOP — Data Entry Templates

These CSV files are templates for entering your real data into the CSI Digital Operating Platform.
Each file maps to one or more database tables.

## How to Use

1. Open each CSV file in Excel or Google Sheets
2. Replace the sample rows with your real data (keep the header row!)
3. Save as CSV (UTF-8)
4. Run the import script: `node templates/import.mjs`

Options:
- `--dry-run` — validate and show what would be imported without writing to DB
- `--file 04` — import only one template (matches filename substring)

## Template Files

| File | Description | Target Table(s) |
|------|-------------|-----------------|
| `01_STAFF.csv` | Team members with roles & departments | STAFF |
| `02_SKILLS_ASSESSMENT.csv` | Staff skill competency levels | STAFF_SKILL (via SKILL lookup) |
| `03_CERTIFICATIONS.csv` | Professional certifications | CERTIFICATION |
| `04_WORK_ORDERS.csv` | Work orders with assignments | CSI_WO, EXTERNAL_WO, WO_ASSIGNMENT, WO_TASK |
| `05_TENDERS.csv` | Tender pipeline entries | TENDER |
| `06_KPI_TARGETS.csv` | KPI metrics per staff per period | KPI_RECORD |
| `07_OI_TRACKER.csv` | Opportunity of Interest counts | OI_TRACKER |
| `08_ROLE_SPLIT.csv` | Role split % per department | ROLE_SPLIT |

## Column Reference

### 01_STAFF.csv
- **StaffCode**: Unique code (e.g., CSI-001)
- **RoleCode**: One of: HOD, SM, TL, TM, BIM_TL, BIM_MOD
- **DeptCode**: One of: CSI, CMT, CBA, CGI, CPO, CSA
- **SubTeam**: Optional sub-team code: A, B, C, or D (leave empty for HOD/SM)
- **ProductivityFactor**: 0.0–1.0 (HOD ~0.80, TM ~1.00)
- **DailyUsableHours**: Typically 8.0
- **Status**: Active, Inactive, or OnLeave
- **SystemConfigFlag**: true/false (admin access)

### 02_SKILLS_ASSESSMENT.csv
- **CompetencyLevel**: Beginner, Intermediate, Advanced, Expert
- **TechnologyDomain**: Cloud, Cyber Security, Data Centre, Network, Enterprise Architecture, AI / HPC, BIM, Consultancy

### 04_WORK_ORDERS.csv
- **SourceOfWO**: Who sent this WO. One of: CMT, CSA, CPO, CBA, CST, CSO, CGI, CSF, Legal, Procurement, SVP, Chairman, CSI HOD, Others
- **RequesterName**: PIC or requester name from the source department (optional)
- **RequestTypeName**: Must match an existing request type name. Available types: Leads / Opportunity, Tender / RFP, Documentation, Physical Consultancy, Non-Physical Consultancy, BIM Presales ICT, BIM Presales Total Solution, BIM Presales Management, BIM Postsales ICT, BIM Postsales Total Solution, BIM Postsales Management, Project Monitoring, Others, Training/Event/Knowledge, HR Matters, Google CP (own domain), Partner Engagement (Others domain)
- **TierCode**: 1 (Simple), 2 (Moderate), or 3 (Complex)
- **PriorityInterdepart**: Inter-department priority from requestor — Low, Normal, High, Urgent, Critical (no "Medium")
- **PriorityInternal**: CSI's own internal assessment — Low, Normal, High, Urgent, Critical, N/A (optional)
- **SLAWorkingDays**: SLA deadline in working days (positive integer, optional)
- **DueDate**: Target completion date (YYYY-MM-DD, optional)
- **MonitoringEmail**: Staff email of who monitors this WO (optional)
- **AssigneeEmail**: Staff email to assign to (optional — if provided with AssignedHours, creates assignment)
- **AssignedHours**: Allocated hours for assignee (number, optional)
- **TenderOrProjectCode**: Reference to tender or project code (optional)
- **IndicativeValue**: Indicative project value in RM (optional)
- **ComplexityValue**: Estimated effort/cost value e.g. project value in RM or man-days (optional)
- **Remark**: Additional notes (optional)
- **ExtWoNo**: External WO number from source system (optional — omit for internal WOs like CSI HOD)
- **ProjectCode**: Project reference code (optional)
- **SourceDeptCode**: Department code of the source (optional, for external WOs)
- **EndUser**: End user contact at client side (optional)
- **ReceivedDate**: Date WO was received from source (YYYY-MM-DD, optional)
- **Status**: Open, InProgress, PendingApproval, Closed, OnHold

### 05_TENDERS.csv
- **TenderCategory**: Government, Private, GLC, International
- **Status**: Prospect, Qualified, InProgress, Submitted, Clarification, Won, Lost, Cancelled

### 06_KPI_TARGETS.csv
- **Period**: Format YYYY-QN (e.g., 2026-Q2)

## Notes
- Staff are matched by **Email** across all templates
- Skills are matched by **SkillName + TechnologyDomain**
- Request types are matched by **TypeName**
- Percentages in ROLE_SPLIT must sum to exactly 100% per department
- OI_TRACKER: Won must be <= Registered
- **Tender/RFP work orders** automatically get the 16-item tender checklist populated
- **Internal WOs** (SourceOfWO = "CSI HOD") can omit all External WO fields (ExtWoNo, ExtClientName, etc.)
- Import uses **ON CONFLICT** upsert — re-running is safe and updates existing records
