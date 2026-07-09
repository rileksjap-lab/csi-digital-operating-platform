import pool, { query } from "@/lib/db/pool";
import type { AuthSession } from "@/lib/types/api";
import { insertAuditEntry } from "@/lib/db/audit";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GoNoGoOverrideResult {
  goNoGoId: string;
  overrideBy: string;
  overrideByName: string;
  overrideReason: string;
  overrideAt: string;
}

export interface GoNoGoDetail {
  id: string;
  scoringId: string;
  referenceNo: string;
  tenderId: string | null;
  tenderName: string | null;
  planningHorizonDays: number;
  projectedCSIUtilization: number | null;
  projectedCMTUtilization: number | null;
  recommendation: string;
  overrideBy: string | null;
  overrideByName: string | null;
  overrideReason: string | null;
  evaluatedAt: string;
  scoring: ScoringDetail;
}

export interface ScoringDetail {
  id: string;
  referenceNo: string;
  functionalBreadth: number;
  integrationCount: number;
  complianceDepth: number;
  solutionNovelty: number;
  commercialComplexity: number;
  stakeholderIntensity: number;
  isRush: boolean;
  isConsortium: boolean;
  isSecurityHeavy: boolean;
  isCustomDev: boolean;
  isManyQA: boolean;
  isOnsite: boolean;
  weightedScore: number | null;
  baselineTierName: string | null;
  scoredByName: string;
  scoredAt: string;
}

// ─── List Go/No-Go evaluations for a tender ────────────────────────────────

export async function listGoNoGoByTender(
  tenderId: string
): Promise<GoNoGoDetail[]> {
  const result = await query(
    `SELECT
      g.id, g.scoringid, g.planninghorizondays, g.projectedcsiutilization,
      g.projectedcmtutilization, g.recommendation, g.overrideby,
      g.overridereason, g.evaluatedat,
      ts.referenceno AS "ScoringRefNo", ts.tenderid,
      ts.functionalbreadth, ts.integrationcount, ts.compliancedepth,
      ts.solutionnovelty, ts.commercialcomplexity, ts.stakeholderintensity,
      ts.isrush, ts.isconsortium, ts.issecurityheavy, ts.iscustomdev,
      ts.ismanyqa, ts.isonsite, ts.weightedscore, ts.scoredat,
      t.tendername,
      bt.tiersize AS "BaselineTierName",
      sb.name AS "ScoredByName",
      ob.name AS "OverrideByName"
    FROM gonogo_evaluation g
    JOIN tender_scoring ts ON ts.id = g.scoringid
    LEFT JOIN tender t ON t.id = ts.tenderid
    LEFT JOIN baseline_tier bt ON bt.id = ts.baselinetierid
    JOIN staff sb ON sb.id = ts.scoredby
    LEFT JOIN staff ob ON ob.id = g.overrideby
    WHERE ts.tenderid = $1
    ORDER BY g.evaluatedat DESC`,
    [tenderId]
  );

  return result.rows.map(mapGoNoGoDetail);
}

// ─── Get single Go/No-Go evaluation ────────────────────────────────────────

export async function getGoNoGoById(
  goNoGoId: string
): Promise<GoNoGoDetail | null> {
  const result = await query(
    `SELECT
      g.id, g.scoringid, g.planninghorizondays, g.projectedcsiutilization,
      g.projectedcmtutilization, g.recommendation, g.overrideby,
      g.overridereason, g.evaluatedat,
      ts.referenceno AS "ScoringRefNo", ts.tenderid,
      ts.functionalbreadth, ts.integrationcount, ts.compliancedepth,
      ts.solutionnovelty, ts.commercialcomplexity, ts.stakeholderintensity,
      ts.isrush, ts.isconsortium, ts.issecurityheavy, ts.iscustomdev,
      ts.ismanyqa, ts.isonsite, ts.weightedscore, ts.scoredat,
      t.tendername,
      bt.tiersize AS "BaselineTierName",
      sb.name AS "ScoredByName",
      ob.name AS "OverrideByName"
    FROM gonogo_evaluation g
    JOIN tender_scoring ts ON ts.id = g.scoringid
    LEFT JOIN tender t ON t.id = ts.tenderid
    LEFT JOIN baseline_tier bt ON bt.id = ts.baselinetierid
    JOIN staff sb ON sb.id = ts.scoredby
    LEFT JOIN staff ob ON ob.id = g.overrideby
    WHERE g.id = $1`,
    [goNoGoId]
  );

  if (result.rows.length === 0) return null;
  return mapGoNoGoDetail(result.rows[0]);
}

// ─── Create scoring + Go/No-Go evaluation ──────────────────────────────────

export interface ScoringInput {
  tenderId: string;
  functionalBreadth: number;
  integrationCount: number;
  complianceDepth: number;
  solutionNovelty: number;
  commercialComplexity: number;
  stakeholderIntensity: number;
  isRush?: boolean;
  isConsortium?: boolean;
  isSecurityHeavy?: boolean;
  isCustomDev?: boolean;
  isManyQA?: boolean;
  isOnsite?: boolean;
  planningHorizonDays?: number;
}

const CRITERIA_WEIGHTS = {
  functionalBreadth: 0.20,
  integrationCount: 0.15,
  complianceDepth: 0.15,
  solutionNovelty: 0.20,
  commercialComplexity: 0.15,
  stakeholderIntensity: 0.15,
};

const BONUS_FLAGS = [
  "isRush", "isConsortium", "isSecurityHeavy",
  "isCustomDev", "isManyQA", "isOnsite",
] as const;

function computeWeightedScore(input: ScoringInput): number {
  let score =
    input.functionalBreadth * CRITERIA_WEIGHTS.functionalBreadth +
    input.integrationCount * CRITERIA_WEIGHTS.integrationCount +
    input.complianceDepth * CRITERIA_WEIGHTS.complianceDepth +
    input.solutionNovelty * CRITERIA_WEIGHTS.solutionNovelty +
    input.commercialComplexity * CRITERIA_WEIGHTS.commercialComplexity +
    input.stakeholderIntensity * CRITERIA_WEIGHTS.stakeholderIntensity;

  const bonusCount = BONUS_FLAGS.filter(
    (f) => input[f as keyof ScoringInput]
  ).length;
  score += bonusCount * 0.25;

  return Math.round(score * 100) / 100;
}

export async function createScoringAndGoNoGo(
  input: ScoringInput,
  session: AuthSession
): Promise<GoNoGoDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Generate reference number: GNG-DDMMYYYY-NNN
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yyyy = now.getFullYear();
    const prefix = `GNG-${dd}${mm}${yyyy}-`;
    const seqRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS "cnt" FROM tender_scoring WHERE referenceno LIKE $1`,
      [`${prefix}%`]
    );
    const seq = parseInt(seqRes.rows[0].cnt, 10) + 1;
    const referenceNo = `${prefix}${String(seq).padStart(3, "0")}`;

    const weightedScore = computeWeightedScore(input);

    // Determine baseline tier from weighted score
    // Score ranges: 0-1.5 = Small, 1.5-2.5 = Medium, 2.5-3.5 = Large, 3.5+ = Mega
    let tierSize: string;
    if (weightedScore < 1.5) tierSize = "Small";
    else if (weightedScore < 2.5) tierSize = "Medium";
    else if (weightedScore < 3.5) tierSize = "Large";
    else tierSize = "Mega";

    const tierRes = await client.query<{ id: string }>(
      `SELECT id FROM baseline_tier WHERE tiersize = $1`,
      [tierSize]
    );
    const baselineTierId = tierRes.rows[0]?.id ?? null;

    // Insert scoring
    const scoringRes = await client.query<{ Id: string }>(
      `INSERT INTO tender_scoring
        (referenceno, tenderid, functionalbreadth, integrationcount,
         compliancedepth, solutionnovelty, commercialcomplexity,
         stakeholderintensity, isrush, isconsortium, issecurityheavy,
         iscustomdev, ismanyqa, isonsite, weightedscore, baselinetierid,
         scoredby)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id AS "Id"`,
      [
        referenceNo, input.tenderId,
        input.functionalBreadth, input.integrationCount,
        input.complianceDepth, input.solutionNovelty,
        input.commercialComplexity, input.stakeholderIntensity,
        input.isRush ?? false, input.isConsortium ?? false,
        input.isSecurityHeavy ?? false, input.isCustomDev ?? false,
        input.isManyQA ?? false, input.isOnsite ?? false,
        weightedScore, baselineTierId, session.staffId,
      ]
    );
    const scoringId = scoringRes.rows[0].Id;

    // Determine recommendation based on weighted score threshold
    const recommendation = weightedScore >= 3.5 ? "NoGo" : "Go";
    const horizonDays = input.planningHorizonDays ?? 10;

    // Insert Go/No-Go evaluation
    const goNoGoRes = await client.query<{ Id: string }>(
      `INSERT INTO gonogo_evaluation
        (scoringid, planninghorizondays, recommendation)
       VALUES ($1, $2, $3)
       RETURNING id AS "Id"`,
      [scoringId, horizonDays, recommendation]
    );
    const goNoGoId = goNoGoRes.rows[0].Id;

    await insertAuditEntry(
      {
        entityName: "GONOGO_EVALUATION",
        entityId: goNoGoId,
        action: "Insert",
        newValue: JSON.stringify({
          referenceNo,
          weightedScore,
          recommendation,
          tenderId: input.tenderId,
        }),
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    const detail = await getGoNoGoById(goNoGoId);
    return detail!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Override ───────────────────────────────────────────────────────────────

export async function overrideGoNoGo(
  tenderId: string,
  goNoGoId: string,
  overrideReason: string,
  session: AuthSession
): Promise<{ result: GoNoGoOverrideResult | null; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const evalRes = await client.query(
      `SELECT g.id, g.recommendation, g.overrideby, ts.tenderid
       FROM gonogo_evaluation g
       JOIN tender_scoring ts ON ts.id = g.scoringid
       WHERE g.id = $1`,
      [goNoGoId]
    );
    if (evalRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: null, error: "NOT_FOUND" };
    }
    const eval_ = evalRes.rows[0];

    if (eval_.tenderid !== tenderId) {
      await client.query("ROLLBACK");
      return { result: null, error: "NOT_FOUND" };
    }

    if (eval_.recommendation === "Go") {
      await client.query("ROLLBACK");
      return { result: null, error: "ALREADY_GO" };
    }

    if (eval_.overrideby) {
      await client.query("ROLLBACK");
      return { result: null, error: "ALREADY_OVERRIDDEN" };
    }

    await client.query(
      `UPDATE gonogo_evaluation
       SET overrideby = $1, overridereason = $2, updatedat = now()
       WHERE id = $3`,
      [session.staffId, overrideReason, goNoGoId]
    );

    await insertAuditEntry(
      {
        entityName: "GONOGO_EVALUATION",
        entityId: goNoGoId,
        action: "Override",
        newValue: JSON.stringify({ overrideReason }),
        performedBy: session.staffId,
      },
      client
    );

    await client.query("COMMIT");

    return {
      result: {
        goNoGoId,
        overrideBy: session.staffId,
        overrideByName: session.displayName,
        overrideReason,
        overrideAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ─── Mapper ─────────────────────────────────────────────────────────────────

function mapGoNoGoDetail(r: Record<string, unknown>): GoNoGoDetail {
  return {
    id: r.id as string,
    scoringId: r.scoringid as string,
    referenceNo: r.ScoringRefNo as string,
    tenderId: (r.tenderid as string) ?? null,
    tenderName: (r.tendername as string) ?? null,
    planningHorizonDays: Number(r.planninghorizondays),
    projectedCSIUtilization: r.projectedcsiutilization != null
      ? parseFloat(String(r.projectedcsiutilization))
      : null,
    projectedCMTUtilization: r.projectedcmtutilization != null
      ? parseFloat(String(r.projectedcmtutilization))
      : null,
    recommendation: r.recommendation as string,
    overrideBy: (r.overrideby as string) ?? null,
    overrideByName: (r.OverrideByName as string) ?? null,
    overrideReason: (r.overridereason as string) ?? null,
    evaluatedAt: String(r.evaluatedat),
    scoring: {
      id: r.scoringid as string,
      referenceNo: r.ScoringRefNo as string,
      functionalBreadth: Number(r.functionalbreadth),
      integrationCount: Number(r.integrationcount),
      complianceDepth: Number(r.compliancedepth),
      solutionNovelty: Number(r.solutionnovelty),
      commercialComplexity: Number(r.commercialcomplexity),
      stakeholderIntensity: Number(r.stakeholderintensity),
      isRush: Boolean(r.isrush),
      isConsortium: Boolean(r.isconsortium),
      isSecurityHeavy: Boolean(r.issecurityheavy),
      isCustomDev: Boolean(r.iscustomdev),
      isManyQA: Boolean(r.ismanyqa),
      isOnsite: Boolean(r.isonsite),
      weightedScore: r.weightedscore != null
        ? parseFloat(String(r.weightedscore))
        : null,
      baselineTierName: (r.BaselineTierName as string) ?? null,
      scoredByName: r.ScoredByName as string,
      scoredAt: String(r.scoredat),
    },
  };
}
