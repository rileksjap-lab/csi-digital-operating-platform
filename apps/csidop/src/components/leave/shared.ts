import type { DayPart, LeaveAction, LeaveStatus } from "@/lib/leave/rules";

export interface LeaveType { id: string; code: string; name: string; colour: string; trackBalance: boolean; halfDayAllowed: boolean; active: boolean; sortOrder: number }
export interface Meta { types: LeaveType[]; colleagues: { id: string; name: string }[]; canApprove: boolean; isHod: boolean; actingForHod: boolean }

export interface LeaveRow {
  id: string; staffId: string; staffName: string; subTeam: string | null;
  leaveTypeId: string; typeCode: string; typeName: string; colour: string;
  startDate: string; endDate: string; dayPart: DayPart; days: number; reason: string | null;
  coverStaffId: string | null; coverName: string | null; status: LeaveStatus;
  smDecidedByName: string | null; hodDecidedByName: string | null; decisionNote: string | null;
  actions: LeaveAction[];
}

export interface BalanceRow {
  leaveTypeId: string; code: string; name: string; colour: string; configured: boolean;
  entitled: number; carriedForward: number; adjustment: number; approved: number; pending: number; balance: number;
}

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  PendingSM: "Waiting for Solution Manager", PendingHOD: "Waiting for HOD", Approved: "Approved", Rejected: "Not approved", Cancelled: "Cancelled",
};
export const STATUS_TONE: Record<LeaveStatus, string> = {
  PendingSM: "bg-amber-50 text-amber-700", PendingHOD: "bg-amber-50 text-amber-700", Approved: "bg-green-50 text-green-700",
  Rejected: "bg-red-50 text-red-700", Cancelled: "bg-gray-100 text-gray-500",
};

export const PART_LABEL: Record<DayPart, string> = { Full: "", AM: " (morning)", PM: " (afternoon)" };

export const fmtRange = (s: string, e: string, part: DayPart = "Full") => {
  const f = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return (s === e ? f(s) : `${f(s)} to ${f(e)}`) + PART_LABEL[part];
};

export const fmtDays = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export const inputCls = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50";
export const btnCls = "rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40";
export const primaryCls = "rounded bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-40";
export const dangerCls = "rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40";
