import { z } from "zod";

export const gonogoOverrideSchema = z.object({
  overrideReason: z.string().min(20, "Override reason must be at least 20 characters").max(1000),
});

export type GonogoOverrideInput = z.infer<typeof gonogoOverrideSchema>;
