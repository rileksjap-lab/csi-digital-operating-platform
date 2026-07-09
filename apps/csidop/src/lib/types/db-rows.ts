export interface DepartmentRow {
  Id: string;
  DeptCode: string;
  DeptName: string;
}

export interface RoleRow {
  Id: string;
  RoleCode: string;
  RoleName: string;
  CapacityScope: string;
}

export interface RequestTypeRow {
  Id: string;
  TypeCode: number;
  TypeName: string;
  Domain: string;
  SlaAckDays: number;
  SlaClassifyDays: number;
  SlaRouteDays: number;
}

export interface TierRow {
  Id: string;
  TierCode: number;
  TierName: string;
  ApproverRoleId: string;
}

export interface StaffRow {
  Id: string;
  StaffCode: string;
  Name: string;
  Email: string;
  RoleId: string;
  DeptId: string;
  SubTeam: string | null;
  ProductivityFactor: string;
  DailyUsableHours: string;
  Status: string;
  SystemConfigFlag: boolean;
}

export interface CsiWoRow {
  Id: string;
  CSI_WO_No: string;
  ExtWO_Id: string;
  TenderId: string | null;
  RequestTypeId: string;
  Title: string;
  Priority: string;
  IndicativeValue: string | null;
  ComplexityValue: string | null;
  TaskScore: string | null;
  TierId: string;
  CreatedBy: string;
  AssignedTo: string | null;
  DueDate: string | null;
  Status: string;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface AssignmentRow {
  Id: string;
  CSI_WO_Id: string;
  StaffId: string;
  AssignedHours: string;
  AssignedDate: string;
  AssignedBy: string;
  IsCurrent: boolean;
  ReassignReason: string | null;
  CreatedAt: string;
}

export interface EffortLogRow {
  Id: string;
  CSI_WO_Id: string;
  StaffId: string;
  LogDate: string;
  Hours: string;
  Notes: string | null;
  CreatedAt: string;
}

export interface EvidenceRow {
  Id: string;
  CSI_WO_Id: string;
  FileRef: string;
  EvidenceType: string;
  UploadedBy: string;
  UploadedDate: string;
  RemovedAt: string | null;
  RemovedBy: string | null;
}

export interface ApprovalRow {
  Id: string;
  CSI_WO_Id: string;
  TierId: string;
  ApprovedBy: string;
  Decision: string;
  Reason: string | null;
  DecisionDate: string;
}

export interface ExternalWoRow {
  Id: string;
  ExtWO_No: string;
  ProjectCode: string | null;
  SourceDeptId: string;
  EndUser: string | null;
  ReceivedDate: string;
  Status: string;
}

export interface TenderRow {
  Id: string;
  TenderNo: string;
  TenderName: string;
  Client: string;
  TenderCategory: string | null;
  ClosingDate: string;
  EstimatedValue: string; // NUMERIC comes as string from pg
  SubmittedValue: string | null;
  WinValue: string | null;
  Status: string;
  TenderOwnerId: string;
  CreatedAt: string;
  UpdatedAt: string | null;
}
