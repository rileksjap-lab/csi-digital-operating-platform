const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, TableOfContents,
} = require("docx");

// ─── Colors & Constants ─────────────────────────────────────────────────────
const NAVY = "1A1A2E";
const RED = "ED1F24";
const GRAY = "666666";
const WHITE = "FFFFFF";
const GREEN_BG = "E8F5E9";
const GREEN_TXT = "2E7D32";
const YELLOW_BG = "FFF8E1";
const YELLOW_TXT = "F57F17";
const GRAY_BG = "F5F5F5";
const GRAY_TXT = "757575";
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const CELL_MARGINS = { top: 80, bottom: 80, left: 120, right: 120 };
const TBL_W = 9360;

// ─── Helpers ────────────────────────────────────────────────────────────────
const font = (text, opts = {}) =>
  new TextRun({ text, font: "Arial", size: opts.size ?? 20, ...opts });

const heading1 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 150 },
    children: [font(text, { bold: true, size: 28 })],
  });

const heading2 = (text) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [font(text, { bold: true, size: 24, color: NAVY })],
  });

const heading3 = (text) =>
  new Paragraph({
    spacing: { before: 180, after: 100 },
    children: [font(text, { bold: true, size: 22, color: RED })],
  });

const bodyText = (text) =>
  new Paragraph({
    spacing: { after: 80 },
    children: [font(text, { size: 20 })],
  });

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

function headerCell(text, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    shading: { fill: NAVY, type: ShadingType.CLEAR },
    margins: CELL_MARGINS,
    children: [new Paragraph({ children: [font(text, { bold: true, color: WHITE, size: 18 })] })],
  });
}

function dataCell(text, width, opts = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: BORDERS,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    margins: CELL_MARGINS,
    children: [new Paragraph({
      children: [font(text, { size: 18, bold: opts.bold, color: opts.color })],
    })],
  });
}

function statusBadge(status) {
  if (status === "COMPLETED") return { shading: GREEN_BG, color: GREEN_TXT };
  if (status === "PARTIALLY BUILT") return { shading: YELLOW_BG, color: YELLOW_TXT };
  return { shading: GRAY_BG, color: GRAY_TXT };
}

function makeTable(colWidths, headerTexts, rows) {
  const w = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: w, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({ children: headerTexts.map((t, i) => headerCell(t, colWidths[i])) }),
      ...rows.map(
        (cells) =>
          new TableRow({
            children: cells.map((c, i) => {
              if (typeof c === "object" && c._cell) return c._cell;
              return dataCell(String(c), colWidths[i]);
            }),
          })
      ),
    ],
  });
}

function statusCell(status, width) {
  const s = statusBadge(status);
  return { _cell: dataCell(status, width, { bold: true, ...s }) };
}

// ─── Module data ────────────────────────────────────────────────────────────
const MODULES = [
  {
    num: 1,
    name: "Authentication & Session Management",
    status: "COMPLETED",
    description: "OTP-based email authentication with no local passwords (SR-SEC-01). Supports dev bypass mode for local development. Staff register, admin approves, then OTP login flow.",
    workflow: [
      "Staff submits registration request with name, email, staff code, department, role",
      "Admin (SystemConfigFlag=true) reviews and approves/rejects registration",
      "Approved staff requests OTP via email (6-digit code, 10-minute expiry)",
      "Staff enters OTP to verify identity",
      "System creates JWT session (8-hour expiry) stored in Redis, sets HttpOnly cookie",
      "All subsequent requests validated via middleware JWT check",
      "Logout destroys Redis session and clears cookie",
    ],
    fields: [
      ["Email", "VARCHAR(100)", "Yes", "Staff email address, unique identifier"],
      ["OTP Code", "VARCHAR(6)", "Yes", "6-digit one-time password"],
      ["OTP Expiry", "TIMESTAMP", "Yes", "10 minutes from generation"],
      ["Session ID", "UUID", "Yes", "Redis session key"],
      ["JWT Token", "String", "Yes", "HS256 signed, 8h expiry, payload: {sid}"],
    ],
    endpoints: [
      ["POST", "/api/auth/register", "Public", "Submit registration request"],
      ["POST", "/api/auth/request-otp", "Public", "Request OTP via email"],
      ["POST", "/api/auth/verify-otp", "Public", "Verify OTP and create session"],
      ["GET", "/api/auth/me", "Any", "Get current user profile"],
      ["POST", "/api/auth/logout", "Any", "Destroy session"],
      ["GET", "/api/auth/login", "Public", "Dev mode: auto-login bypass"],
    ],
    roleMatrix: [
      ["Register", "Yes", "Yes", "Yes", "Yes"],
      ["Approve Registration", "Yes*", "No", "No", "No"],
      ["Login/Logout", "Yes", "Yes", "Yes", "Yes"],
    ],
    rules: [
      "No local passwords stored, ever (SR-SEC-01)",
      "OTP expires after 10 minutes or single use",
      "Admin approval required before first login",
      "SystemConfigFlag=true grants admin panel access",
      "Session cookie is HttpOnly, Secure, SameSite=Lax",
      "Dev bypass active only when NODE_ENV=development and OIDC_CLIENT_ID is empty",
    ],
    notes: "Fully implemented. Registration + OTP + admin approval flow working end-to-end. Future: migrate to OIDC SSO via Microsoft Entra ID.",
  },
  {
    num: 2,
    name: "Work Order Management",
    status: "COMPLETED",
    description: "Core module for tracking work orders within CSI department. WOs originate from two sources: External (from EWM system or other departments) and Internal (created by HOD/Manager). Redesigned in v2 to match actual department workflow with dual priority, SLA working days, monitoring staff, and task checklist.",
    workflow: [
      "HOD/Manager creates WO specifying Source of WO (14 department/source options)",
      "System auto-generates CSI_WO_No (format: 300-DDMMYYYY-NNN)",
      "For external WOs: optional External WO No, Source Department, Received Date recorded",
      "Request Type selected (grouped by domain), Complexity Tier and priority assigned",
      "Optional: assign staff member with allocated hours during creation",
      "If assigned, WO status transitions from Open to InProgress automatically",
      "Staff work on WO, update task progress, log effort hours",
      "Staff marks WO complete → PendingApproval",
      "HOD/Manager approves or returns WO",
      "Approved WO moves to Closed status",
    ],
    fields: [
      ["Source of WO", "ENUM", "Yes", "CMT, CSA, CPO, CBA, CST, CSO, CGI, CSF, CHO, Legal, Procurement, CSI HOD, Others"],
      ["CSI WO No", "VARCHAR(20)", "Auto", "Auto-generated: 300-DDMMYYYY-NNN"],
      ["Request Type", "FK → REQUEST_TYPE", "Yes", "Grouped by domain (Consultancy, Solution, Innovation, etc.)"],
      ["Title", "VARCHAR(200)", "Yes", "Brief description of the work order"],
      ["Priority (Inter-dept)", "ENUM", "Yes", "Critical / High / Medium / Low — set by requestor"],
      ["Priority (Internal)", "ENUM", "No", "Critical / High / Medium / Low / N/A — CSI’s own assessment"],
      ["SLA Working Days", "INTEGER", "No", "Deadline measured in working days, not calendar dates"],
      ["Complexity Tier", "FK → COMPLEXITY_TIER", "Yes", "Tier 1 (Simple), Tier 2 (Moderate), Tier 3 (Complex)"],
      ["Complexity Value", "NUMERIC", "No", "Estimated effort or cost value (e.g. RM or man-days)"],
      ["WO Monitoring", "FK → STAFF", "No", "Staff member who oversees this WO"],
      ["Tender/Project Code", "VARCHAR(50)", "No", "Reference to tender or project code if applicable"],
      ["Remark", "TEXT", "No", "Additional notes or instructions"],
      ["External WO No", "VARCHAR(30)", "No*", "From EWM system. Required for external WOs, N/A for internal"],
      ["Assignee", "FK → STAFF", "No", "Optional at creation, can assign later from detail page"],
      ["Assigned Hours", "NUMERIC", "No", "Hours allocated to assignee"],
      ["Status", "ENUM", "Auto", "Open → InProgress → PendingApproval → Closed / OnHold"],
    ],
    endpoints: [
      ["GET", "/api/wo", "Any (scoped)", "List WOs with filters, sort, cursor pagination"],
      ["POST", "/api/wo", "HOD/SM/TL/BIM_TL", "Create new work order with optional assignment"],
      ["GET", "/api/wo/:id", "Any (scoped)", "Get WO detail with tasks, assignments, effort, evidence"],
      ["PATCH", "/api/wo/:id", "HOD/SM/TL", "Update priority, due date, tier (requires amend reason)"],
      ["POST", "/api/wo/:id/assign", "HOD/SM/TL/BIM_TL", "Assign or reassign staff to WO"],
      ["POST", "/api/wo/:id/complete", "Any (assigned)", "Mark WO as complete"],
      ["POST", "/api/wo/:id/approve", "HOD/SM/TL", "Approve or return completed WO"],
    ],
    roleMatrix: [
      ["Create WO", "Yes", "Yes", "Yes", "No"],
      ["View WO (scoped)", "Department", "Stream", "Pod", "Self"],
      ["Assign Staff", "Yes", "Yes", "Yes", "No"],
      ["Update WO Fields", "Yes", "Yes", "Yes", "No"],
      ["Complete WO", "Yes", "Yes", "Yes", "Yes (own)"],
      ["Approve/Return", "Yes", "Yes", "Yes", "No"],
    ],
    rules: [
      "CSI_WO_No is auto-generated, never accepted as user input",
      "External WO No is optional — internal WOs (source: CSI HOD) have no external reference",
      "Row-level scope enforced server-side: HOD=Department, SM=Stream, TL=Pod, TM=Self",
      "Priority (Inter-dept) set by requestor; Priority (Internal) is CSI’s own assessment",
      "SLA measured in working days, not calendar dates",
      "Assignment during creation is optional; can assign later from WO detail page",
      "Reassignment requires a logged reason (audit trail)",
      "Status transitions: Open → InProgress (on assign) → PendingApproval (on complete) → Closed (on approve)",
      "Amending dueDate or tierId requires an amendReason",
    ],
    notes: "Fully redesigned in v2 (migration 017). Form, API, and frontend updated. Supports both external (EWM) and internal WO creation workflows. Future: EWM API integration for auto-import.",
  },
  {
    num: 3,
    name: "WO Task Checklist & Progress",
    status: "COMPLETED",
    description: "Child task tracking per work order with percentage-based progress (0–100%). For Tender/RFP work orders, auto-populates a standard 16-item baseline checklist. Non-tender WOs support free-form task entry.",
    workflow: [
      "When a Tender/RFP WO is created, system auto-populates 16-item baseline checklist from template",
      "For non-tender WOs, HOD/SM/TL adds tasks manually (free-form)",
      "Each task has: description, assigned staff (optional), scope (Internal/External), progress %",
      "Staff updates task progress (0–100%) as work progresses",
      "Overall WO progress calculated as average of all task progress values",
      "Tasks can be added, updated, or removed throughout the WO lifecycle",
    ],
    fields: [
      ["Task No", "SERIAL", "Auto", "Auto-incrementing within each WO"],
      ["Description", "VARCHAR(200)", "Yes", "What needs to be done"],
      ["Assigned To", "FK → STAFF", "No", "Staff responsible for this task"],
      ["Progress", "INTEGER (0–100)", "Yes", "Percentage complete, default 0"],
      ["Scope", "ENUM", "Yes", "Internal or External"],
      ["Date Created", "TIMESTAMP", "Auto", "When task was added"],
      ["Date Completed", "TIMESTAMP", "Auto", "When progress reaches 100%"],
    ],
    endpoints: [
      ["POST", "/api/wo/:id/tasks", "HOD/SM/TL/BIM_TL", "Add task to work order"],
      ["PATCH", "/api/wo/:id/tasks/:taskId", "Any (scoped)", "Update task progress, description, assignment"],
      ["DELETE", "/api/wo/:id/tasks/:taskId", "HOD/SM/TL", "Remove task from work order"],
    ],
    roleMatrix: [
      ["Add Task", "Yes", "Yes", "Yes", "No"],
      ["Update Progress", "Yes", "Yes", "Yes", "Yes (own)"],
      ["Delete Task", "Yes", "Yes", "Yes", "No"],
    ],
    rules: [
      "Tender/RFP WOs auto-populate from TENDER_CHECKLIST_TEMPLATE (16 baseline items)",
      "Baseline items: Culcu, EP Fill, Prestasi, Jadual Pelaksanaan, Pematuhan, Org Chart, Pasukan Projek, Cadangan, Katalog/Brosur, and others",
      "Non-tender WOs have no standard template — tasks are fully free-form",
      "Progress must be 0–100 integer",
      "WO overall progress = AVG(task progress values)",
      "Complex tenders may have additional tasks beyond the baseline",
    ],
    notes: "Fully implemented. Template table seeded with 16 items. Auto-population triggered by request type name containing ‘Tender’ or ‘RFP’.",
  },
  {
    num: 4,
    name: "WO Assignment & Utilization",
    status: "COMPLETED",
    description: "Staff assignment workflow with capacity-aware utilization view. Supports initial assignment during WO creation and later reassignment from the detail page.",
    workflow: [
      "Option A: Assign during WO creation via optional ‘Assign To Staff’ section",
      "Option B: Assign later from WO detail page → /wo/:id/assign",
      "Assignment page shows staff list with utilization bands and pod filters",
      "Manager selects staff member and allocates hours",
      "System creates assignment record and updates WO.AssignedTo",
      "If WO was Open, status transitions to InProgress",
      "Reassignment deactivates current assignment and requires a reason",
    ],
    fields: [
      ["Staff ID", "FK → STAFF", "Yes", "Assigned team member"],
      ["Assigned Hours", "NUMERIC", "Yes", "Hours allocated for this WO"],
      ["Assigned Date", "DATE", "Auto", "Date of assignment"],
      ["Assigned By", "FK → STAFF", "Auto", "Manager who made the assignment"],
      ["Is Current", "BOOLEAN", "Auto", "true for active assignment"],
      ["Reassign Reason", "VARCHAR(500)", "Conditional", "Required when reassigning"],
    ],
    endpoints: [
      ["POST", "/api/wo/:id/assign", "HOD/SM/TL/BIM_TL", "Assign or reassign staff"],
      ["GET", "/api/capacity", "Any", "Staff utilization list with bands"],
    ],
    roleMatrix: [
      ["Assign Staff", "Yes", "Yes", "Yes", "No"],
      ["Reassign (with reason)", "Yes", "Yes", "Yes", "No"],
      ["View Utilization", "Department", "Stream", "Pod", "Self"],
    ],
    rules: [
      "Utilization bands: Free (<50%), Safe (50–74%), Warning (75–89%), Overloaded (≥90%)",
      "Reassignment requires a logged reason",
      "Assignment triggers notification to assigned staff",
      "First assignment transitions WO from Open to InProgress",
    ],
    notes: "Fully implemented. Both create-time assignment and post-creation assignment supported.",
  },
  {
    num: 5,
    name: "Effort Logging",
    status: "COMPLETED",
    description: "Daily time tracking per work order. Staff log hours spent each day with optional notes.",
    workflow: [
      "Staff navigates to assigned WO or My Tasks",
      "Logs hours for a specific date (max 8h per entry)",
      "Adds optional notes describing work done",
      "Effort totals visible on WO detail and progress dashboard",
    ],
    fields: [
      ["WO ID", "FK → CSI_WO", "Yes", "Which work order"],
      ["Log Date", "DATE", "Yes", "Date work was performed"],
      ["Hours", "NUMERIC(4,2)", "Yes", "Hours spent (0.01–8.00)"],
      ["Notes", "VARCHAR(500)", "No", "Description of work done"],
    ],
    endpoints: [
      ["GET", "/api/effort", "Any (scoped)", "List effort logs with filters"],
      ["POST", "/api/effort", "Any", "Log effort hours"],
      ["PATCH", "/api/effort/:id", "Owner", "Update hours or notes"],
      ["DELETE", "/api/effort/:id", "Owner", "Remove effort entry"],
    ],
    roleMatrix: [
      ["Log Own Effort", "Yes", "Yes", "Yes", "Yes"],
      ["View Effort (scoped)", "Department", "Stream", "Pod", "Self"],
      ["Edit/Delete Own", "Yes", "Yes", "Yes", "Yes"],
    ],
    rules: [
      "Maximum 8 hours per effort log entry",
      "Staff can only edit/delete their own entries",
      "Effort totals aggregated on WO detail page",
    ],
    notes: "Fully implemented.",
  },
  {
    num: 6,
    name: "Evidence Management",
    status: "COMPLETED",
    description: "File upload and management for work order deliverables and supporting documents.",
    workflow: [
      "Staff requests upload URL for a file (validates type and size)",
      "System returns pre-signed upload URL",
      "Staff uploads file directly to storage",
      "Staff confirms upload with evidence type classification",
      "Evidence listed on WO detail page",
      "Soft-delete only — files are never hard-deleted",
    ],
    fields: [
      ["Filename", "VARCHAR(200)", "Yes", "Original file name"],
      ["MIME Type", "VARCHAR(100)", "Yes", "PDF, images, Office docs, ZIP"],
      ["File Size", "INTEGER", "Yes", "Max 25 MB"],
      ["Evidence Type", "VARCHAR(50)", "Yes", "Category classification"],
      ["RemovedAt", "TIMESTAMP", "No", "Soft-delete timestamp"],
      ["RemovedBy", "FK → STAFF", "No", "Who soft-deleted"],
    ],
    endpoints: [
      ["POST", "/api/evidence/upload-url", "Any", "Request pre-signed upload URL"],
      ["POST", "/api/evidence/confirm", "Any", "Confirm upload completion"],
      ["GET", "/api/evidence", "Any (scoped)", "List evidence for a WO"],
    ],
    roleMatrix: [
      ["Upload Evidence", "Yes", "Yes", "Yes", "Yes"],
      ["View Evidence", "Department", "Stream", "Pod", "Self"],
      ["Soft-Delete", "Yes", "Yes", "No", "No"],
    ],
    rules: [
      "Evidence files use soft-delete (RemovedAt/RemovedBy), never hard delete",
      "Allowed types: PDF, JPEG, PNG, GIF, DOCX, XLSX, PPTX, ZIP",
      "Maximum file size: 25 MB",
    ],
    notes: "Fully implemented.",
  },
  {
    num: 7,
    name: "WO Progress Dashboard",
    status: "COMPLETED",
    description: "Comprehensive progress tracking dashboard with overview stats, overdue items, assignee breakdown, priority analysis, and SLA compliance.",
    workflow: [
      "User navigates to WO Progress page",
      "Dashboard shows role-scoped data (HOD=dept, SM=stream, TL=pod, TM=self)",
      "Overview cards: total, open, in-progress, closed, overdue, avg resolution days, SLA compliance %",
      "Overdue items list with days overdue count",
      "By-assignee breakdown: staff name, open/in-progress/closed/overdue counts, effort hours",
      "By-priority breakdown: active, closed, overdue per priority level",
      "SLA bands: Overdue, Due Soon (3d), Due This Week, On Track, No Due Date",
      "Recent activity feed showing latest WO updates",
    ],
    fields: [],
    endpoints: [
      ["GET", "/api/wo/progress", "Any (scoped)", "Full progress dashboard data"],
    ],
    roleMatrix: [
      ["View Dashboard", "Department", "Stream", "Pod", "Self"],
    ],
    rules: [
      "All data is role-scoped at the server level",
      "SLA compliance = % of closed WOs completed on or before due date",
      "Average resolution days = mean time from creation to closure",
    ],
    notes: "Fully implemented.",
  },
  {
    num: 8,
    name: "My Tasks",
    status: "COMPLETED",
    description: "Personal work queue for individual staff members showing their assigned WOs with summary counts.",
    workflow: [
      "Staff views their assigned work orders",
      "Summary: open, in-progress, pending approval, due this week",
      "Filter by status",
      "Click through to WO detail for actions",
    ],
    fields: [],
    endpoints: [
      ["GET", "/api/wo/my-tasks", "Any", "Personal WO list with summary"],
    ],
    roleMatrix: [
      ["View Own Tasks", "Yes", "Yes", "Yes", "Yes"],
    ],
    rules: [
      "Shows only WOs assigned to the current user",
      "Due this week = WOs with due date within 7 days",
    ],
    notes: "Fully implemented.",
  },
  {
    num: 9,
    name: "Executive Dashboard",
    status: "COMPLETED",
    description: "High-level KPI summary for department heads with status distribution, priority breakdown, and recent activity.",
    workflow: [
      "HOD views department-level KPI cards",
      "WO status distribution chart",
      "Priority breakdown",
      "Recent activity table",
    ],
    fields: [],
    endpoints: [
      ["GET", "/api/dashboard", "HOD/SM", "Executive dashboard data"],
    ],
    roleMatrix: [
      ["View Dashboard", "Yes", "Yes", "No", "No"],
    ],
    rules: [
      "Department-scoped data for HOD",
    ],
    notes: "Fully implemented. Shows on the main / route.",
  },
  {
    num: 10,
    name: "Department Dashboard",
    status: "NOT STARTED",
    description: "Operational dashboard with kanban board view of WOs by status, stream/pod filters, and team capacity at-a-glance.",
    workflow: [
      "Manager views kanban board with WO cards organized by status columns",
      "Filter by stream or pod",
      "Capacity utilization overview per team member",
      "Drag-and-drop status transitions (future)",
    ],
    fields: [],
    endpoints: [
      ["GET", "/api/dashboard/department", "HOD/SM/TL", "Department dashboard data (planned)"],
    ],
    roleMatrix: [
      ["View Dashboard", "Yes", "Yes", "Yes", "No"],
    ],
    rules: [
      "Role-scoped: HOD sees department, SM sees stream, TL sees pod",
    ],
    notes: "Not yet started. Planned as operational companion to the Executive Dashboard.",
  },
  {
    num: 11,
    name: "Tender Pipeline (CSI View)",
    status: "PARTIALLY BUILT",
    description: "Read-only tracking view of tenders for CSI department. CMT department owns tender intake, commercial/pricing, and submission. CSI only handles the technical part once a tender is approved as ‘Go’.",
    workflow: [
      "CMT captures tender intake and initiates commercial evaluation",
      "Go/No-Go decision made by tender committee (HOD CSI + HOD CMT)",
      "Once ‘Go’, CMT initiates WO to CSI for technical work",
      "CSI tracks: tender status, technical assignments, deliverables via WO",
      "CSI view is read-only — no create/edit actions for tenders",
      "Full tender management will be in CMT module (future)",
    ],
    fields: [
      ["Tender No", "VARCHAR(30)", "Auto", "Auto-generated by system"],
      ["Title", "VARCHAR(200)", "Yes", "Tender title"],
      ["Client Name", "VARCHAR(150)", "Yes", "Client/organization"],
      ["Status", "ENUM", "Yes", "Pipeline stages"],
      ["Indicative Value", "NUMERIC", "No", "Estimated contract value (RM)"],
      ["Submission Date", "DATE", "No", "Tender submission deadline"],
    ],
    endpoints: [
      ["GET", "/api/tenders", "Any (scoped)", "List tenders (read-only for CSI)"],
      ["GET", "/api/tenders/:id", "Any (scoped)", "Tender detail (read-only for CSI)"],
    ],
    roleMatrix: [
      ["View Tenders", "Yes", "Yes", "Yes", "Yes"],
      ["Create/Edit Tender", "No*", "No*", "No*", "No*"],
    ],
    rules: [
      "CSI users have read-only access to tenders",
      "Tender creation and management belongs to CMT department (future module)",
      "Go/No-Go is decided by committee: HOD CSI + HOD CMT",
      "Once Go, CMT initiates WO to CSI; CSI manages technical execution",
      "‘+ New Tender’ button removed from CSI sidebar",
      "Tender link positioned at bottom of CSI sidebar as read-only tracking",
    ],
    notes: "Page exists with read-only list. No create/edit actions for CSI. Full tender management deferred to CMT module. Sidebar link moved to bottom position.",
  },
  {
    num: 12,
    name: "Capacity Planning",
    status: "COMPLETED",
    description: "Staff utilization calculation based on assigned hours, role split percentages, and productivity factors.",
    workflow: [
      "System calculates available hours per staff based on role split and productivity",
      "Assigned hours aggregated from active work orders",
      "Utilization percentage = assigned hours / available hours",
      "Staff categorized into bands: Free, Safe, Warning, Overloaded",
    ],
    fields: [
      ["Utilization %", "Calculated", "Auto", "Assigned hours / available capacity"],
      ["Band", "ENUM", "Auto", "Free / Safe / Warning / Overloaded"],
      ["Remaining Capacity", "NUMERIC", "Auto", "Available minus assigned hours"],
    ],
    endpoints: [
      ["GET", "/api/capacity", "Any (scoped)", "Staff utilization with bands"],
    ],
    roleMatrix: [
      ["View Capacity", "Department", "Stream", "Pod", "Self"],
    ],
    rules: [
      "Role-split percentages must sum to exactly 100% per department",
      "Bands: Free <50%, Safe 50–74%, Warning 75–89%, Overloaded ≥90%",
    ],
    notes: "Fully implemented.",
  },
  {
    num: 13,
    name: "Workloads View",
    status: "COMPLETED",
    description: "Domain-tabbed view showing WO distribution across request type domains with summary statistics.",
    workflow: [
      "User navigates to Workloads page",
      "Tabs for each domain: All, Consultancy, Solution, Innovation, etc.",
      "Summary cards: active tenders, total value, SLA compliance, overdue count",
      "Filterable WO table within each domain tab",
    ],
    fields: [],
    endpoints: [
      ["GET", "/api/workloads", "Any (scoped)", "WO summary by domain"],
    ],
    roleMatrix: [
      ["View Workloads", "Department", "Stream", "Pod", "Self"],
    ],
    rules: [
      "Data is role-scoped",
      "No tender creation from this page (removed)",
    ],
    notes: "Fully implemented. ‘+ New Tender’ button removed since CSI doesn’t create tenders.",
  },
  {
    num: 14,
    name: "Staff & Skills Management",
    status: "COMPLETED",
    description: "Staff profiles, certifications tracking, skill assessments, and skills management for all CSI staff members. Supports CRUD for skills and certifications with domain-based grouping.",
    workflow: [
      "Staff views their own skills and certifications on Profile page",
      "Skills page shows full department skill matrix with domain tabs",
      "Staff can add new skills with competency level (Beginner/Intermediate/Advanced/Expert)",
      "Staff can add certifications with vendor, level, issue date, and expiry date",
      "Certifications tracked with status indicators for expiry",
      "HOD/SM can view team-wide skills across the department/stream",
    ],
    fields: [
      ["Skill Name", "VARCHAR(100)", "Yes", "Name of the skill"],
      ["Technology Domain", "VARCHAR(50)", "Yes", "Cloud, Cyber Security, Network, BIM, etc."],
      ["Competency Level", "ENUM", "Yes", "Beginner / Intermediate / Advanced / Expert"],
      ["Last Assessment Date", "DATE", "Yes", "Date of last competency assessment"],
      ["Certification Name", "VARCHAR(100)", "Yes", "Name of certification"],
      ["Vendor", "VARCHAR(100)", "No", "Issuing organization"],
      ["Certification Level", "VARCHAR(50)", "No", "Professional / Expert / Specialist / etc."],
      ["Issue Date", "DATE", "Yes", "When obtained"],
      ["Expiry Date", "DATE", "No", "When it expires"],
    ],
    endpoints: [
      ["GET", "/api/skills", "Any (scoped)", "Staff skills list with domain filter"],
      ["POST", "/api/skills", "Any", "Add new skill assessment"],
      ["PATCH", "/api/skills/:id", "Owner/Admin", "Update skill competency level"],
      ["POST", "/api/skills/certifications", "Any", "Add certification"],
      ["PATCH", "/api/skills/certifications/:id", "Owner/Admin", "Update certification"],
    ],
    roleMatrix: [
      ["View Own Skills", "Yes", "Yes", "Yes", "Yes"],
      ["View Team Skills", "Department", "Stream", "Pod", "No"],
      ["Add Own Skills/Certs", "Yes", "Yes", "Yes", "Yes"],
      ["Manage Others", "Yes", "No", "No", "No"],
    ],
    rules: [
      "STAFF rows are never hard-deleted (Active/Inactive/OnLeave status)",
      "Skills grouped by Technology Domain for matrix view",
      "Certifications tracked with expiry dates",
    ],
    notes: "Fully implemented. Skills and certifications CRUD with domain-based views.",
  },
  {
    num: 15,
    name: "KPI & Performance Dashboard",
    status: "COMPLETED",
    description: "Performance scorecard and achievement tracking by quarter. Shows overall achievement, per-metric summary, individual scorecards with expandable detail, and OI (Opportunity of Interest) tracking.",
    workflow: [
      "User selects quarter from period dropdown (last 8 quarters available)",
      "Dashboard displays 4 KPI cards: Overall Achievement %, Staff Tracked, Metrics Met (x of y), Miss Rate %",
      "Metric Achievement Summary shows grid of cards per metric with progress rings",
      "Individual Scorecards table shows each staff member with progress, metrics met/total, OI stats",
      "Expandable detail per staff shows each metric as progress bar with target vs achieved",
    ],
    fields: [
      ["Staff ID", "FK → STAFF", "Yes", "Which staff member"],
      ["Period", "VARCHAR(20)", "Yes", "Quarter format: YYYY-QN (e.g. 2026-Q2)"],
      ["Metric Name", "VARCHAR(100)", "Yes", "KPI metric name"],
      ["Target Value", "NUMERIC", "Yes", "Expected target"],
      ["Achieved Value", "NUMERIC", "No", "Measured result"],
      ["OI Registered", "INTEGER", "No", "Opportunity of Interest count"],
      ["OI Won", "INTEGER", "No", "OI converted to wins"],
    ],
    endpoints: [
      ["GET", "/api/kpi", "Any (scoped)", "KPI dashboard data by period"],
    ],
    roleMatrix: [
      ["View KPI Dashboard", "Department", "Stream", "Pod", "Self"],
    ],
    rules: [
      "Color-coded achievement: green >= 100%, yellow >= 70%, red < 70%",
      "OI Won must be <= OI Registered",
      "Data grouped by staff with expandable metric detail",
    ],
    notes: "Fully implemented with SVG progress rings, color-coded metrics, and expandable staff detail.",
  },
  {
    num: 16,
    name: "Reports & Analytics",
    status: "COMPLETED",
    description: "Report generation centre with 11 predefined report types covering operations, capacity, governance, KPI, tenders, and executive summary. CSV export available; PDF/Excel/PPTX planned via FastAPI compute worker.",
    workflow: [
      "User navigates to Reports page, sees grid of 11 report cards",
      "Click a report card to open parameter panel",
      "Set Period From/To dates and export Format (CSV available now; PDF/Excel/PPTX planned)",
      "Click 'Generate Report' to download the data",
      "Available reports: Monthly WO Trend, Capacity & Utilization, CMT-to-CSI WO Linkage, Governance & Compliance Audit Trail, KPI Achievement, OI & Commission, Resource Capacity, Competency Gap Analysis, Certification Compliance, Tender Pipeline, Chairman Executive Summary",
    ],
    fields: [],
    endpoints: [
      ["GET", "/api/reports", "HOD/SM", "Generate report data with type and date range"],
    ],
    roleMatrix: [
      ["View Reports", "Yes", "Yes", "No", "No"],
      ["Export Reports", "Yes", "Yes", "No", "No"],
    ],
    rules: [
      "Reports are role-scoped to department/stream level",
      "11 report types covering all operational domains",
      "CSV export immediate; PDF/Excel/PPTX require FastAPI worker (planned)",
    ],
    notes: "Fully implemented with 11 report types. CSV export working. Rich PDF/Excel export planned for FastAPI integration.",
  },
  {
    num: 17,
    name: "Admin & Master Data Panel",
    status: "COMPLETED",
    description: "Comprehensive administrative panel with 8 sub-sections: Pending Approvals, Request Types & SLA, Complexity Tiers, Baseline Tiers, Multiplier Factors, Role Split %, System Settings, and Staff Management. Accessible only to users with SystemConfigFlag=true.",
    workflow: [
      "Admin navigates to Admin panel (visible in sidebar only for SystemConfigFlag users)",
      "Left sub-navigation shows 8 sections",
      "Pending Approvals: review and approve/reject staff registration requests, assign roles",
      "Request Types & SLA: inline edit type codes, names, domains, and SLA day targets",
      "Complexity Tiers: inline edit tier codes, names, approver roles",
      "Baseline Tiers: read-only view of tier sizing (CSI/CMT hours)",
      "Multiplier Factors: inline edit factor values (Rush, Consortium, Security-Heavy, etc.)",
      "Role Split %: grouped by department, editable percentages that must sum to 100%",
      "System Settings: key-value system configuration with inline edit",
      "Staff Management: add/edit staff members with department, role, productivity factor, status",
    ],
    fields: [],
    endpoints: [
      ["GET", "/api/admin/registrations", "Admin", "List pending registrations"],
      ["PATCH", "/api/admin/registrations/:id", "Admin", "Approve or reject registration"],
      ["GET", "/api/admin/staff", "Admin", "List staff with filters"],
      ["POST", "/api/admin/staff", "Admin", "Create new staff member"],
      ["PATCH", "/api/admin/staff/:id", "Admin", "Update staff details"],
      ["PATCH", "/api/admin/request-types/:id", "Admin", "Update request type SLA"],
      ["PATCH", "/api/admin/tiers/:id", "Admin", "Update complexity tier"],
      ["PATCH", "/api/admin/multipliers/:id", "Admin", "Update multiplier factor"],
      ["PUT", "/api/admin/role-split/:deptId", "Admin", "Save role split for department"],
    ],
    roleMatrix: [
      ["Access Admin Panel", "Yes*", "Yes*", "Yes*", "No"],
      ["Approve/Reject Registration", "Yes*", "Yes*", "Yes*", "No"],
      ["Manage Staff", "Yes*", "Yes*", "Yes*", "No"],
      ["Edit Master Data", "Yes*", "Yes*", "Yes*", "No"],
    ],
    rules: [
      "Only users with SystemConfigFlag=true can access (not role-based)",
      "Registration approval is required before first login",
      "Role split percentages must sum to exactly 100% per department",
      "Staff rows are never hard-deleted — use Active/Inactive/OnLeave status",
    ],
    notes: "Fully implemented with 8 sub-sections. *Requires SystemConfigFlag, not role-based.",
  },
  {
    num: 18,
    name: "Notifications",
    status: "COMPLETED",
    description: "In-app notification system with bell icon badge, notification inbox page, category filtering, and mark-as-read functionality.",
    workflow: [
      "System generates notification on trigger events (WO assignment, approval, SLA warning)",
      "Notification bell in topbar shows unread count badge",
      "User clicks bell or navigates to /notifications",
      "Notification inbox shows list with category badges (WorkOrder/Approval/Tender/System/General)",
      "Filter by All or Unread",
      "Mark individual notifications as read, or use 'Mark all as read' button",
      "Click 'View' to navigate to the linked resource",
    ],
    fields: [
      ["Title", "VARCHAR(200)", "Yes", "Notification heading"],
      ["Body", "TEXT", "No", "Notification detail"],
      ["Category", "ENUM", "Yes", "WorkOrder / Approval / Tender / System / General"],
      ["Link URL", "VARCHAR(300)", "No", "Navigation target"],
      ["Read At", "TIMESTAMP", "No", "When user read the notification"],
    ],
    endpoints: [
      ["GET", "/api/notifications", "Any", "List notifications with pagination"],
      ["PATCH", "/api/notifications/:id/read", "Owner", "Mark as read"],
      ["PATCH", "/api/notifications/read-all", "Owner", "Mark all as read"],
    ],
    roleMatrix: [
      ["Receive Notifications", "Yes", "Yes", "Yes", "Yes"],
      ["Mark as Read", "Yes", "Yes", "Yes", "Yes"],
    ],
    rules: [
      "Notification created on: WO assignment, SLA approaching, approval request",
      "Unread notifications show blue dot and light blue background",
      "Pagination with Previous/Next buttons",
    ],
    notes: "Fully implemented. Bell icon badge, notification inbox with filters, mark-as-read.",
  },
  {
    num: 19,
    name: "Audit Trail",
    status: "COMPLETED",
    description: "Immutable audit log with hash-chaining for all significant system actions. INSERT+SELECT only for the application database role.",
    workflow: [
      "System logs action on entity change (create, update, assign, status change)",
      "Each entry hash-chained with SHA-256 of previous entry",
      "Audit log is append-only — no UPDATE or DELETE permitted",
      "New partitions automatically inherit immutability via event trigger",
    ],
    fields: [
      ["Entity Name", "VARCHAR(50)", "Yes", "Table name (e.g. CSI_WO)"],
      ["Entity ID", "UUID", "Yes", "Record ID"],
      ["Action", "VARCHAR(20)", "Yes", "Insert / Update / Delete"],
      ["Field Name", "VARCHAR(50)", "No", "Which field changed"],
      ["Old Value", "TEXT", "No", "Previous value"],
      ["New Value", "TEXT", "No", "New value"],
      ["Reason", "VARCHAR(500)", "No", "Why the change was made"],
      ["Performed By", "FK → STAFF", "Yes", "Who made the change"],
      ["Integrity Hash", "VARCHAR(64)", "Auto", "SHA-256 chain hash"],
    ],
    endpoints: [],
    roleMatrix: [
      ["View Audit Log", "Yes", "No", "No", "No"],
    ],
    rules: [
      "AUDIT_LOG is INSERT+SELECT only for csidop_app role",
      "Never grant UPDATE/DELETE, including on new partitions",
      "Event trigger (migration 013) enforces immutability automatically",
      "Hash chain: SHA-256(prevHash | entityName | entityId | action | timestamp)",
    ],
    notes: "Fully implemented. Infrastructure tested with partition auto-protection.",
  },
  {
    num: 20,
    name: "System Configuration",
    status: "COMPLETED",
    description: "Integrated into the Admin Panel (Module 17). Lookup tables, multiplier factors, role splits, and system settings are all managed from the Admin sub-navigation.",
    workflow: [
      "Admin navigates to Admin panel → selects relevant sub-section",
      "Request Types & SLA: view and inline-edit type codes, names, domains, SLA targets",
      "Complexity Tiers: view and inline-edit tier definitions",
      "Multiplier Factors: view and inline-edit multiplier values",
      "Role Split %: edit department role distribution (must sum to 100%)",
      "System Settings: view and edit key-value system configuration",
    ],
    fields: [],
    endpoints: [
      ["GET", "/api/lookups", "Any", "Read all lookup tables"],
      ["PATCH", "/api/admin/request-types/:id", "Admin", "Update request type"],
      ["PATCH", "/api/admin/tiers/:id", "Admin", "Update complexity tier"],
      ["PATCH", "/api/admin/multipliers/:id", "Admin", "Update multiplier factor"],
      ["PUT", "/api/admin/role-split/:deptId", "Admin", "Save role split for department"],
    ],
    roleMatrix: [
      ["View Configuration", "Yes*", "Yes*", "Yes*", "No"],
      ["Modify Configuration", "Yes*", "Yes*", "Yes*", "No"],
    ],
    rules: [
      "Only users with SystemConfigFlag=true",
      "Changes to lookup tables are audited",
      "Role split percentages must sum to exactly 100% per department",
    ],
    notes: "Fully implemented as part of Admin Panel. *Requires SystemConfigFlag.",
  },
];

// ─── Build document ────────────────────────────────────────────────────────
function buildModuleSection(m) {
  const children = [];

  // Module heading
  children.push(heading1(`${m.num}. ${m.name}`));

  // Status + description
  const sb = statusBadge(m.status);
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [
      font("Status: ", { bold: true, size: 20 }),
      font(m.status, { bold: true, size: 20, color: sb.color }),
    ],
  }));
  children.push(bodyText(m.description));

  // Workflow
  children.push(heading3("Workflow Steps"));
  m.workflow.forEach((step, i) => {
    children.push(new Paragraph({
      numbering: { reference: "steps", level: 0 },
      spacing: { after: 40 },
      children: [font(step, { size: 19 })],
    }));
  });

  // Data fields
  if (m.fields.length > 0) {
    children.push(heading3("Data Fields"));
    const cols = [2200, 1800, 800, 4560];
    children.push(makeTable(cols, ["Field", "Type", "Required", "Description"], m.fields));
  }

  // API endpoints
  if (m.endpoints.length > 0) {
    children.push(heading3("API Endpoints"));
    const cols = [800, 2800, 2000, 3760];
    children.push(makeTable(cols, ["Method", "Endpoint", "Access", "Description"], m.endpoints));
  }

  // Role matrix
  if (m.roleMatrix.length > 0) {
    children.push(heading3("Role Access Matrix"));
    const cols = [2500, 1500, 1500, 1500, 2360];
    children.push(makeTable(cols, ["Action", "HOD", "SM", "TL", "TM"], m.roleMatrix));
  }

  // Business rules
  if (m.rules.length > 0) {
    children.push(heading3("Business Rules"));
    m.rules.forEach((rule) => {
      children.push(new Paragraph({
        numbering: { reference: "bullets", level: 0 },
        spacing: { after: 40 },
        children: [font(rule, { size: 19 })],
      }));
    });
  }

  // Implementation notes
  children.push(heading3("Implementation Notes"));
  children.push(bodyText(m.notes));

  // Page break after each module except last
  if (m.num < 20) children.push(pageBreak());

  return children;
}

async function main() {
  const summaryRows = MODULES.map((m) => [
    String(m.num),
    m.name,
    m.status,
    statusCell(m.status, 2000),
  ]);

  // For the summary table, use a modified version
  const summaryTable = new Table({
    width: { size: TBL_W, type: WidthType.DXA },
    columnWidths: [500, 4360, 2500, 2000],
    rows: [
      new TableRow({
        children: [
          headerCell("#", 500),
          headerCell("Module", 4360),
          headerCell("Category", 2500),
          headerCell("Status", 2000),
        ],
      }),
      ...MODULES.map((m) => {
        const sb = statusBadge(m.status);
        const category = m.num <= 3 ? "Core" : m.num <= 8 ? "Tracking" : m.num <= 13 ? "Analytics" : m.num <= 16 ? "Management" : "System";
        return new TableRow({
          children: [
            dataCell(String(m.num), 500),
            dataCell(m.name, 4360),
            dataCell(category, 2500),
            dataCell(m.status, 2000, { bold: true, color: sb.color, shading: sb.shading }),
          ],
        });
      }),
    ],
  });

  const moduleChildren = MODULES.flatMap(buildModuleSection);

  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Arial", size: 20 } } },
      paragraphStyles: [
        {
          id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 28, bold: true, font: "Arial", color: NAVY },
          paragraph: { spacing: { before: 300, after: 150 }, outlineLevel: 0 },
        },
        {
          id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
          run: { size: 24, bold: true, font: "Arial", color: NAVY },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{
            level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: "steps",
          levels: [{
            level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RED, space: 4 } },
              children: [
                font("CSIDOP Module Workflow Review", { size: 16, color: GRAY, bold: true }),
                font("  |  v3.0  |  INTERNAL USE ONLY", { size: 16, color: GRAY }),
              ],
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD", space: 4 } },
              alignment: AlignmentType.CENTER,
              children: [
                font("CSI Digital Operating Platform  —  10 Creative Solutions Sdn Bhd  —  Page ", { size: 16, color: GRAY }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: GRAY }),
              ],
            })],
          }),
        },
        children: [
          // ── Cover Page ──
          new Paragraph({ spacing: { before: 2500 } }),
          new Paragraph({
            spacing: { after: 100 },
            alignment: AlignmentType.CENTER,
            children: [font("CSI DIGITAL OPERATING PLATFORM", { bold: true, size: 44, color: NAVY })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            alignment: AlignmentType.CENTER,
            children: [font("Comprehensive Module Workflow Review", { size: 36, color: RED })],
          }),
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 3, color: RED, space: 10 } },
            spacing: { before: 400, after: 100 },
            alignment: AlignmentType.CENTER,
            children: [font("20 Modules • API Endpoints • Role Matrix • Implementation Status", { size: 22, color: GRAY })],
          }),
          new Paragraph({ spacing: { before: 500 } }),

          // Cover metadata table
          new Table({
            width: { size: 5000, type: WidthType.DXA },
            columnWidths: [2000, 3000],
            rows: [
              ["Version:", "3.0"],
              ["Date:", "27 June 2026"],
              ["Author:", "Farhan Bin Nordin"],
              ["Department:", "CSI, 10 Creative Solutions Sdn Bhd"],
              ["Classification:", "INTERNAL USE ONLY"],
            ].map(([label, value]) =>
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 2000, type: WidthType.DXA },
                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                    children: [new Paragraph({ children: [font(label, { bold: true, color: GRAY, size: 20 })] })],
                  }),
                  new TableCell({
                    width: { size: 3000, type: WidthType.DXA },
                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                    children: [new Paragraph({
                      children: [font(value, {
                        size: 20,
                        bold: label === "Classification:",
                        color: label === "Classification:" ? RED : "333333",
                      })],
                    })],
                  }),
                ],
              })
            ),
          }),

          // ── TOC ──
          pageBreak(),
          heading1("Table of Contents"),
          new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),

          // ── Module Summary ──
          pageBreak(),
          heading1("Module Summary"),
          bodyText("Overview of all 20 modules with their current implementation status."),
          new Paragraph({ spacing: { after: 120 } }),
          summaryTable,

          // Status legend
          new Paragraph({ spacing: { before: 200, after: 60 } }),
          new Paragraph({
            children: [
              font("Status Legend: ", { bold: true, size: 18 }),
              font("COMPLETED", { bold: true, size: 18, color: GREEN_TXT }),
              font(" = Fully built and tested  |  ", { size: 18 }),
              font("PARTIALLY BUILT", { bold: true, size: 18, color: YELLOW_TXT }),
              font(" = Some functionality exists  |  ", { size: 18 }),
              font("NOT STARTED", { bold: true, size: 18, color: GRAY_TXT }),
              font(" = Planned, not yet implemented", { size: 18 }),
            ],
          }),

          // ── Key Changes in v2.0 ──
          pageBreak(),
          heading1("Key Changes in v3.0"),
          bodyText("Major updates since v2.0 (26 June 2026):"),
          new Paragraph({ spacing: { after: 60 } }),

          ...[
            "Department names corrected to match actual 10CS org structure: 12 departments (CSA, CMT, CSI, CPO, CST, CSO, CGI, CSF, CBA, CHO, Legal, Procurement)",
            "WO Source list updated: SVP/Chairman replaced with CHO code; total 13 source options",
            "Skills & Certifications module fully implemented: 3-tab view (Skills, Certifications, Training Plans) with CRUD and domain-based grouping",
            "KPI Dashboard fully implemented: quarter-based scorecard with progress rings, per-metric summary, expandable individual detail",
            "Reports module completed: 11 report types with CSV export and date range parameters",
            "Admin Panel expanded to 8 sub-sections: Pending Approvals, Request Types, Tiers, Baseline, Multipliers, Role Split, Settings, Staff Management",
            "Notifications module completed: bell badge, inbox page with category filters, mark-as-read, pagination",
            "System Configuration integrated into Admin Panel — no longer a separate module",
            "Audit log action values fixed: ‘Create’ corrected to ‘Insert’ to match DB constraint",
          ].map((text) =>
            new Paragraph({
              numbering: { reference: "bullets", level: 0 },
              spacing: { after: 60 },
              children: [font(text, { size: 19 })],
            })
          ),

          // ── Module Detail Sections ──
          pageBreak(),
          ...moduleChildren,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync("C:\\Projects\\csi-digital-operating-platform\\docs\\CSIDOP_Module_Workflow_Review_v3.docx", buffer);
  console.log("Generated CSIDOP_Module_Workflow_Review.docx (v3.0)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
