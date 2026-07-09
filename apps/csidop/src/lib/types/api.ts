// ─── Standard API response envelope (API Spec §2) ────────────────────────────
// Every endpoint returns one of these two shapes — never a bare object.

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta | null;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    errors?: FieldError[];
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Cursor-based pagination (API Spec §3) ────────────────────────────────────
// Offset pagination is explicitly forbidden — use cursors on all list endpoints.

export interface PaginationMeta {
  total: number;
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
  hasPrevPage: boolean;
}

export interface PaginationParams {
  limit?: number;
  after?: string;
  before?: string;
}

// ─── Field-level validation errors (Zod surface) ─────────────────────────────

export interface FieldError {
  field: string;
  message: string;
}

// ─── Authenticated session (decoded JWT + STAFF lookup) ───────────────────────

export type Role =
  | "HOD"
  | "SolutionManager"
  | "TeamLead"
  | "TeamMember"
  | "BIMModeler"
  | "BIMTeamLead";

export type CapacityScope = "Department" | "Stream" | "Pod" | "Self";

export interface AuthSession {
  staffId: string;
  staffCode: string;
  email: string;
  displayName: string;
  roleId: string;
  roleCode: string;
  role: Role;
  roleName: string;
  departmentId: string;
  deptCode: string;
  subTeam: string | null;
  capacityScope: CapacityScope;
  systemConfigFlag: boolean;
  /** ISO 8601 expiry of the Redis session key */
  expiresAt: string;
}
