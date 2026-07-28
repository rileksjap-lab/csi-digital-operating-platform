// Standardized, generic proficiency rubric applied to whichever skill the
// staff member is assessing themselves against. Deliberately one shared
// question set rather than hand-authored questions per skill — with dozens
// of skills across 8 domains, per-skill authoring would be unmaintainable.

export const COMPETENCY_LEVELS = ["Beginner", "Intermediate", "Advanced", "Expert"] as const;
export type CompetencyLevel = (typeof COMPETENCY_LEVELS)[number];

export interface RubricQuestion {
  key: string;
  text: string;
}

export const RUBRIC_QUESTIONS: RubricQuestion[] = [
  { key: "understanding", text: "I understand the core concepts of this skill and can explain them clearly to others." },
  { key: "independence", text: "I can apply this skill independently on real project work without supervision." },
  { key: "delivery", text: "I have successfully delivered project or task work using this skill in the last 12 months." },
  { key: "troubleshooting", text: "I can troubleshoot complex or edge-case problems in this area without external help." },
  { key: "mentoring", text: "I have mentored, trained, or reviewed other people's work in this skill." },
];

export interface RubricAnswerOption {
  value: 0 | 1 | 2 | 3;
  label: string;
}

export const RUBRIC_ANSWER_SCALE: RubricAnswerOption[] = [
  { value: 0, label: "Not yet — little to no real experience" },
  { value: 1, label: "Somewhat — only with guidance" },
  { value: 2, label: "Mostly — comfortable in typical cases" },
  { value: 3, label: "Fully — consistently, even in edge cases" },
];

export const RUBRIC_MAX_SCORE = RUBRIC_QUESTIONS.length * 3;

export function computeSuggestedLevel(totalScore: number): CompetencyLevel {
  if (totalScore <= 3) return "Beginner";
  if (totalScore <= 8) return "Intermediate";
  if (totalScore <= 12) return "Advanced";
  return "Expert";
}

export function currentQuarterLabel(date: Date = new Date()): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

export function validateAnswers(answers: Record<string, number>): { valid: boolean; totalScore: number } {
  let totalScore = 0;
  for (const q of RUBRIC_QUESTIONS) {
    const v = answers[q.key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 3) {
      return { valid: false, totalScore: 0 };
    }
    totalScore += v;
  }
  if (Object.keys(answers).length !== RUBRIC_QUESTIONS.length) {
    return { valid: false, totalScore: 0 };
  }
  return { valid: true, totalScore };
}
