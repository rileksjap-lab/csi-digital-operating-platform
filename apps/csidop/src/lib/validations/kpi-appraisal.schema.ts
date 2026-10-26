import { z } from "zod";

const text = (max: number) => z.string().max(max);

export const scoresSchema = z.object({
  scores: z
    .array(
      z.object({
        lineId: z.string().uuid().optional(),
        itemId: z.string().uuid().optional(),
        rating: z.number().int().min(1).max(10).nullable(),
        comment: text(4000).nullable().optional(),
        evidence: text(4000).nullable().optional(),
      })
    )
    .min(1)
    .max(100),
});

export const certsSchema = z.object({
  certs: z
    .array(z.object({ name: text(200).min(1), yearLabel: text(20).nullable().optional(), category: text(30).min(1) }))
    .max(40),
});

export const oneOnOneSchema = z.object({
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-06-22"),
  notes: text(8000).nullable().optional(),
  agreedActions: text(8000).nullable().optional(),
});

export const transitionSchema = z.object({
  action: z.enum(["submitSelf", "returnToStaff", "submitReview", "returnToReviewer", "finalise", "reopen", "sendToHR"]),
  note: text(2000).nullable().optional(),
});

export const openSchema = z.object({ cycleId: z.string().uuid() });

export const signOffSchema = z.object({
  hodTicks: z.array(text(60)).max(10).optional(),
  svpTicks: z.array(text(60)).max(10).optional(),
  opsName: text(150).nullable().optional(),
  opsDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-20").nullable().optional(),
  svpSign: z.boolean().optional(),
});
