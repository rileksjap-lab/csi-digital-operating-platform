import { z } from "zod";

const CATEGORIES = ["Networking", "Security", "Cloud", "Hardware & OS", "General"] as const;

export const itKnowledgeQuestionCreateSchema = z.object({
  questionText: z.string().min(1).max(1000),
  optionA: z.string().min(1).max(300),
  optionB: z.string().min(1).max(300),
  optionC: z.string().min(1).max(300),
  optionD: z.string().min(1).max(300),
  correctOption: z.enum(["A", "B", "C", "D"]),
  category: z.enum(CATEGORIES),
});

export const itKnowledgeQuestionPatchSchema = z.object({
  questionText: z.string().min(1).max(1000).optional(),
  optionA: z.string().min(1).max(300).optional(),
  optionB: z.string().min(1).max(300).optional(),
  optionC: z.string().min(1).max(300).optional(),
  optionD: z.string().min(1).max(300).optional(),
  correctOption: z.enum(["A", "B", "C", "D"]).optional(),
  category: z.enum(CATEGORIES).optional(),
  isActive: z.boolean().optional(),
});

export const itKnowledgeQuestionListQuerySchema = z.object({
  activeOnly: z.coerce.boolean().optional(),
});

export const itKnowledgeAttemptSubmitSchema = z.object({
  answers: z.record(z.string().uuid(), z.enum(["A", "B", "C", "D"])),
});

export const itKnowledgeAttemptListQuerySchema = z.object({
  staffId: z.string().uuid().optional(),
});
