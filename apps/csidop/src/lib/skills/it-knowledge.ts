export type ItKnowledgeLevel = "Beginner" | "Intermediate" | "Advanced" | "Expert";

export function computeItKnowledgeLevel(scorePercent: number): ItKnowledgeLevel {
  if (scorePercent < 40) return "Beginner";
  if (scorePercent < 65) return "Intermediate";
  if (scorePercent < 85) return "Advanced";
  return "Expert";
}

export function currentQuarterLabel(date: Date = new Date()): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}
