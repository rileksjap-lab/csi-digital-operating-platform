// Appraisal scoring. Pure functions, no database access, so the same formula is
// used by the API, the form preview and the HR export. Weights, scales and
// thresholds are inputs (they come from the KPI_* configuration tables), never
// constants in here, apart from the default split of the 120 points.

export interface ComponentMax {
  kra: number;
  value: number;
  bonus: number;
}

/** KRA /60 + HR value /40 + bonus /20 = 120, unless the cycle config says otherwise. */
export const DEFAULT_COMPONENT_MAX: ComponentMax = { kra: 60, value: 40, bonus: 20 };

export const KRA_RATING_MAX = 5;
/** Without evidence a rating may not exceed the "meets minimum expectation" baseline. */
export const NO_EVIDENCE_RATING_CAP = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface ScoredEntry {
  /** Weight as entered in the configuration (percent). */
  weight: number;
  /** Highest possible score for this entry. */
  scaleMax: number;
  /** Null = not scored yet; counts as zero. */
  score: number | null;
}

/**
 * Points earned for one component:
 *   maxPoints x sum(weight x score / scaleMax) / sum(weight)
 * Dividing by the total weight keeps it correct for the 20-point bonus block
 * (four items of 5%) as well as for blocks whose weights add up to 100.
 */
export function componentPoints(entries: ScoredEntry[], maxPoints: number): number {
  const totalWeight = entries.reduce((s, e) => s + e.weight, 0);
  if (totalWeight <= 0) return 0;
  const earned = entries.reduce((s, e) => s + e.weight * ((e.score ?? 0) / e.scaleMax), 0);
  return round2((maxPoints * earned) / totalWeight);
}

export function kraPoints(lines: { weight: number; rating: number | null }[], max = DEFAULT_COMPONENT_MAX.kra): number {
  return componentPoints(
    lines.map((l) => ({ weight: l.weight, scaleMax: KRA_RATING_MAX, score: l.rating })),
    max
  );
}

export interface AppraisalTotals {
  kra: number;
  value: number;
  bonus: number;
  total: number;
}

export function appraisalTotals(
  parts: { kra: ScoredEntry[]; value: ScoredEntry[]; bonus: ScoredEntry[] },
  max: ComponentMax = DEFAULT_COMPONENT_MAX
): AppraisalTotals {
  const kra = componentPoints(parts.kra, max.kra);
  const value = componentPoints(parts.value, max.value);
  const bonus = componentPoints(parts.bonus, max.bonus);
  return { kra, value, bonus, total: round2(kra + value + bonus) };
}

export interface OutcomeBand {
  minScore: number;
  outcome: string;
}

/** The band with the highest MinScore that the total reaches. */
export function outcomeFor(total: number, bands: OutcomeBand[]): string | null {
  const reached = bands.filter((b) => total >= b.minScore).sort((a, b) => b.minScore - a.minScore);
  return reached[0]?.outcome ?? null;
}

/**
 * Evidence rule: a rating above the baseline needs evidence when the line asks
 * for it. Returns the problem, or null when the rating is acceptable.
 */
export function ratingProblem(
  rating: number | null,
  opts: { hasEvidence: boolean; evidenceRequired: boolean }
): string | null {
  if (rating === null) return null;
  if (!Number.isInteger(rating) || rating < 1 || rating > KRA_RATING_MAX) return "Rating must be a whole number from 1 to 5";
  if (opts.evidenceRequired && !opts.hasEvidence && rating > NO_EVIDENCE_RATING_CAP) {
    return `A rating above ${NO_EVIDENCE_RATING_CAP} needs supporting evidence`;
  }
  return null;
}

// ── Employee Certifications (item 8): score from a points table ─────────────

export interface CertCategoryRule {
  code: string;
  points: number;
  /** Cap on the points this category can add. */
  maxTotal?: number;
  /** Certificates of this category needed before any score is given. */
  minCount?: number;
}

export interface CertConfig {
  categories: CertCategoryRule[];
  /** Highest item score the points convert to (points map 1:1 up to this). */
  scoreCap: number;
}

export interface CertificateResult {
  totalPoints: number;
  qualified: boolean;
  score: number;
}

export function certificateScore(certs: { category: string }[], config: CertConfig): CertificateResult {
  let totalPoints = 0;
  let qualified = true;
  for (const rule of config.categories) {
    const count = certs.filter((c) => c.category === rule.code).length;
    const raw = count * rule.points;
    totalPoints += rule.maxTotal !== undefined ? Math.min(raw, rule.maxTotal) : raw;
    if (rule.minCount !== undefined && count < rule.minCount) qualified = false;
  }
  const score = qualified ? Math.min(totalPoints, config.scoreCap) : 0;
  return { totalPoints, qualified, score };
}
