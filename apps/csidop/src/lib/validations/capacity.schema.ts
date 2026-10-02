import { z } from "zod";

export const teamActivityQuerySchema = z.object({
  period: z.enum(["today", "week", "month"]).default("today"),
});

export const utilizationQuerySchema = z.object({
  deptCode: z.string().max(20).optional(),
  band: z.string().max(100).optional(),
  // YYYY-MM — defaults to the current month when omitted
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be in YYYY-MM format").optional(),
});

export type UtilizationQuery = z.infer<typeof utilizationQuerySchema>;

export const gonogoOverrideSchema = z.object({
  overrideReason: z.string().min(20, "Override reason must be at least 20 characters").max(1000),
});

export type GonogoOverrideInput = z.infer<typeof gonogoOverrideSchema>;
