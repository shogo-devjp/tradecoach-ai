import { STRATEGY_A_ID, STRATEGY_A_VERSION } from "./config";
import type { BuyCandidate, PaperStrategy, StrategyDecision, StrategyDecisionContext } from "./types";

// Strategy A：既存TradeCoachのBUY/SELL/WAIT判定（Signal型そのもの）をそのまま利用する薄いラッパー。
// Paper Trading独自の判断基準（スコア閾値の変更・entryBlockの追加考慮等）は一切加えない。
// これは「TradeCoachの判定そのものが資産を増やせるか」を検証するという目的に最も忠実な設計。
export const strategyA: PaperStrategy = {
  id: STRATEGY_A_ID,
  version: STRATEGY_A_VERSION,

  decide(context: StrategyDecisionContext): StrategyDecision {
    const { snapshotRows, openPositions } = context;
    const heldCodes = new Set(openPositions.map((p) => p.code));

    const buyCandidates: BuyCandidate[] = snapshotRows
      .filter((row) => row.signal === "買い" && !heldCodes.has(row.code))
      .sort((a, b) => b.score - a.score)
      .map((row) => ({
        code: row.code,
        name: row.name,
        snapshotId: row.id,
        score: row.score,
        reasons: [`score=${row.score}`, `todayAction=${row.todayAction}`],
        stopLoss: row.stopLoss,
        takeProfit: row.takeProfit,
        entryPriceCandidate: row.entryPriceCandidate,
        judgmentAt: row.analyzedAt,
      }));

    const snapshotByCode = new Map(snapshotRows.map((row) => [row.code, row]));
    const sellCodes = openPositions
      .filter((p) => snapshotByCode.get(p.code)?.signal === "売り")
      .map((p) => p.code);

    return { buyCandidates, sellCodes };
  },
};
