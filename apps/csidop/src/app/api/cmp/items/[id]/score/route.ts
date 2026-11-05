import type { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { ok, notFound, internalError } from "@/lib/response";
import { getItemById, getItemUpdate, getItemWeightChain, hasOverdueDecision } from "@/lib/repositories/cmp.repo";
import {
  computeItemScore,
  computeOverallWeight,
  computeWeightedContribution,
  computePlannedScoreToday,
  computeVariance,
  computeRAG,
  type EvidenceStatus,
} from "@/lib/cmp/calculations";

/**
 * Live-computed score/weight/variance/RAG for one item — never stored
 * (see migration 033's comment on cmp_item_updates), always derived at
 * read time from cmp_items + cmp_item_updates + the hierarchy's weight
 * columns via lib/cmp/calculations.ts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const item = await getItemById(id);
    if (!item) return notFound("Item not found");

    const [itemUpdate, weightChain, overdueDecision] = await Promise.all([
      getItemUpdate(id),
      getItemWeightChain(id),
      hasOverdueDecision(id),
    ]);
    if (!weightChain) return notFound("Item's hierarchy weight chain not found");

    const score = computeItemScore({
      scoringMethod: item.scoringMethod,
      currentStatus: itemUpdate?.currentStatus ?? null,
      approvalStatus: itemUpdate?.approvalStatus ?? null,
      kpiTarget: itemUpdate?.kpiTarget ?? null,
      kpiActual: itemUpdate?.kpiActual ?? null,
      manualScore: itemUpdate?.manualScore ?? null,
      evidenceStatus: (itemUpdate?.evidenceStatus as EvidenceStatus) ?? null,
    });

    const overallWeight = computeOverallWeight({
      workstreamWeight: weightChain.workstreamWeight,
      initiativeWeight: weightChain.initiativeWeight,
      factorWeight: weightChain.factorWeight,
      itemWeight: weightChain.itemWeight,
    });
    const weightedContribution = computeWeightedContribution(score, overallWeight);

    let plannedScoreToday: number | null = null;
    let variance: number | null = null;
    if (item.startDate && item.targetDate) {
      plannedScoreToday = computePlannedScoreToday(new Date(item.startDate), new Date(item.targetDate));
      variance = computeVariance(score, plannedScoreToday);
    }

    // computeRAG requires a target date for its 14-day-overdue-forecast
    // check; an item with no target_date set yet can't be judged overdue,
    // so we pass a far-future sentinel that never trips that branch —
    // criticalBlocker and variance-based thresholds still apply normally.
    const rag = computeRAG({
      criticalBlocker: itemUpdate?.criticalBlocker ?? false,
      forecastDate: itemUpdate?.forecastDate ? new Date(itemUpdate.forecastDate) : null,
      targetDate: item.targetDate ? new Date(item.targetDate) : new Date("9999-12-31"),
      variance: variance ?? 0,
      hasOverdueDecision: overdueDecision,
    });

    return ok({
      itemId: id,
      score,
      overallWeight,
      weightedContribution,
      plannedScoreToday,
      variance,
      rag,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const reqId = request.headers.get("x-request-id") ?? "unknown";
    console.error("[cmp/items/:id/score] GET error", err);
    return internalError(reqId);
  }
}
