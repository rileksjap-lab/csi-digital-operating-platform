import { z } from "zod";
import { forbidden } from "@/lib/response";

// ─── Guard: SystemConfigFlag ────────────────────────────────────────────────

export function requireSystemConfig(session: { systemConfigFlag: boolean }) {
  if (!session.systemConfigFlag) {
    throw forbidden("Admin access requires System Configuration permission");
  }
}

// ─── Request type ───────────────────────────────────────────────────────────

export const requestTypePatchSchema = z.object({
  typeName: z.string().min(1).max(80).optional(),
  slaAckDays: z.coerce.number().int().min(1).optional(),
  slaClassifyDays: z.coerce.number().int().min(1).optional(),
  slaRouteDays: z.coerce.number().int().min(1).optional(),
});

// ─── Complexity tier ────────────────────────────────────────────────────────

export const complexityTierPatchSchema = z.object({
  tierName: z.string().min(1).max(30).optional(),
  approverRoleId: z.string().uuid().optional(),
});

// ─── Multiplier factor ──────────────────────────────────────────────────────

export const multiplierFactorPatchSchema = z.object({
  multiplierValue: z.coerce.number().positive().max(10),
});

// ─── Role split ─────────────────────────────────────────────────────────────

export const roleSplitPutSchema = z.object({
  deptId: z.string().uuid(),
  roleSplits: z.array(
    z.object({
      roleId: z.string().uuid(),
      percentage: z.coerce.number().min(0).max(100),
    })
  ).min(1),
}).refine(
  (d) => {
    const sum = d.roleSplits.reduce((acc, r) => acc + r.percentage, 0);
    return Math.abs(sum - 100) < 0.01;
  },
  { message: "Role-split percentages must sum to exactly 100%", path: ["roleSplits"] }
);

// ─── System setting ─────────────────────────────────────────────────────────

export const settingPatchSchema = z.object({
  settingValue: z.string().min(1).max(200),
});

// ─── Staff management ───────────────────────────────────────────────────────

export const staffPatchSchema = z.object({
  roleId: z.string().uuid().optional(),
  deptId: z.string().uuid().optional(),
  subTeam: z.enum(["A", "B", "C", "D"]).nullable().optional(),
  productivityFactor: z.coerce.number().min(0.1).max(1.0).optional(),
  status: z.enum(["Active", "Inactive", "OnLeave"]).optional(),
  systemConfigFlag: z.boolean().optional(),
});

export const staffCreateSchema = z.object({
  staffCode: z.string().min(1).max(20),
  name: z.string().min(1).max(150),
  email: z.string().email().max(150),
  roleId: z.string().uuid(),
  deptId: z.string().uuid(),
  subTeam: z.enum(["A", "B", "C", "D"]).nullable().optional(),
  productivityFactor: z.coerce.number().min(0.1).max(1.0).optional(),
});

export const staffListQuerySchema = z.object({
  status: z.enum(["Active", "Inactive", "OnLeave"]).optional(),
  deptId: z.string().uuid().optional(),
});
