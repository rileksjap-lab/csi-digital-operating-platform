import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-20");
const num = (max: number) => z.number().min(0).max(max);

export const leaveRequestSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: date,
  endDate: date,
  dayPart: z.enum(["Full", "AM", "PM"]).default("Full"),
  reason: z.string().max(1000).nullable().optional(),
  coverStaffId: z.string().uuid().nullable().optional(),
});

export const leaveActionSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  note: z.string().max(500).nullable().optional(),
});

export const leaveConfigSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("type.save"), id: z.string().uuid().optional(),
    code: z.string().regex(/^[A-Z0-9_]{2,20}$/, "Use capital letters, numbers or _ (2 to 20)").optional(),
    name: z.string().min(1).max(60), colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    trackBalance: z.boolean(), halfDayAllowed: z.boolean(), active: z.boolean(),
  }),
  z.object({ op: z.literal("rule.set"), leaveTypeId: z.string().uuid(), minYears: num(60), days: num(366) }),
  z.object({ op: z.literal("rule.delete"), id: z.string().uuid() }),
  z.object({ op: z.literal("holiday.add"), date, name: z.string().min(1).max(120) }),
  z.object({ op: z.literal("holiday.delete"), id: z.string().uuid() }),
  z.object({
    op: z.literal("balance.save"), staffId: z.string().uuid(), leaveTypeId: z.string().uuid(),
    year: z.number().int().min(2000).max(2100),
    entitled: z.number().min(-366).max(366), carriedForward: z.number().min(-366).max(366), adjustment: z.number().min(-366).max(366),
    note: z.string().max(300).nullable().optional(),
  }),
  z.object({ op: z.literal("balance.generate"), year: z.number().int().min(2000).max(2100) }),
  z.object({ op: z.literal("joindate.set"), staffId: z.string().uuid(), joinDate: date.nullable() }),
  z.object({ op: z.literal("approver.set"), staffId: z.string().uuid().nullable(), from: date.optional(), to: date.optional() }),
]);

export type LeaveConfigOp = z.infer<typeof leaveConfigSchema>;
