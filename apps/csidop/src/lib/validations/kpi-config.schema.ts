import { z } from "zod";
import { KPI_METRIC_NAMES } from "@/lib/kpi/metrics";

const text = (max: number) => z.string().trim().max(max);

const bandsSchema = z.object({
  "1": text(500).min(1, "Describe rating 1"),
  "2": text(500).min(1, "Describe rating 2"),
  "3": text(500).min(1, "Describe rating 3"),
  "4": text(500).min(1, "Describe rating 4"),
  "5": text(500).min(1, "Describe rating 5"),
});

export const templateLineSchema = z.object({
  id: z.string().uuid().optional(),
  name: text(150).min(1, "Name is required"),
  measurement: text(2000).nullable().optional(),
  target: text(300).nullable().optional(),
  explanation: text(2000).nullable().optional(),
  weight: z.number().gt(0).max(100),
  evidenceRequired: z.boolean(),
  autoMetric: z.string().refine((m) => KPI_METRIC_NAMES.includes(m), "Unknown KPI metric").nullable().optional(),
  bands: bandsSchema,
});

export const templateSaveSchema = z
  .object({
    displayName: text(100).min(1),
    lines: z.array(templateLineSchema).min(1).max(30),
  })
  .superRefine((v, ctx) => {
    const total = Math.round(v.lines.reduce((s, l) => s + l.weight, 0) * 100) / 100;
    if (total !== 100) ctx.addIssue({ code: "custom", path: ["lines"], message: `Weights must add up to exactly 100% (now ${total}%)` });
  });

export const itemSchema = z.object({
  id: z.string().uuid().optional(),
  section: z.enum(["Value", "Bonus"]),
  name: text(150).min(1, "Name is required"),
  description: text(2000).nullable().optional(),
  weight: z.number().gt(0).max(100),
  scaleMax: z.number().int().min(2).max(10),
  inputMode: z.enum(["Rating", "Certificates"]),
  bands: z.record(z.string().max(500)),
});

export const itemsSaveSchema = z
  .object({ items: z.array(itemSchema).min(1).max(40) })
  .superRefine((v, ctx) => {
    const value = Math.round(v.items.filter((i) => i.section === "Value").reduce((s, i) => s + i.weight, 0) * 100) / 100;
    if (value !== 100) ctx.addIssue({ code: "custom", path: ["items"], message: `HR item weights must add up to exactly 100% (now ${value}%)` });
    if (v.items.filter((i) => i.inputMode === "Certificates").length > 1) {
      ctx.addIssue({ code: "custom", path: ["items"], message: "Only one item can use the certification points table" });
    }
  });

export const outcomeSaveSchema = z
  .object({
    bands: z
      .array(z.object({ minScore: z.number().min(0).max(120), outcome: text(500).min(1) }))
      .min(1)
      .max(12),
  })
  .superRefine((v, ctx) => {
    const mins = v.bands.map((b) => b.minScore);
    if (new Set(mins).size !== mins.length) ctx.addIssue({ code: "custom", path: ["bands"], message: "Two bands start at the same score" });
    if (!mins.includes(0)) ctx.addIssue({ code: "custom", path: ["bands"], message: "One band must start at 0 so every score has an outcome" });
  });

export const certConfigSchema = z.object({
  categories: z
    .array(
      z.object({
        code: text(30).min(1),
        points: z.number().gt(0).max(100),
        maxTotal: z.number().gt(0).max(100).optional(),
        minCount: z.number().int().min(1).max(20).optional(),
      })
    )
    .min(1)
    .max(8),
  scoreCap: z.number().int().min(1).max(10),
});

export const cycleSaveSchema = z.object({
  name: text(100).min(1).optional(),
  status: z.enum(["Draft", "Open", "Closed"]).optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  certificates: certConfigSchema.optional(),
  // Where the final results are emailed. An empty list switches sending off.
  hrEmails: z.array(z.string().trim().toLowerCase().email().max(150)).max(10).optional(),
});
