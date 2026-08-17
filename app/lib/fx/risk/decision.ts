import { DECISION_THRESHOLDS } from "../config/scoringWeights";
import type {
  EconomicEventRisk,
  FxDecisionResult,
  FxRiskReward,
  FxScoreResult,
  MarketRegimeResult,
  MultiTimeframeResult,
} from "../types";

export interface DecisionInputs {
  score: FxScoreResult;
  regime: MarketRegimeResult;
  multiTimeframe: MultiTimeframeResult;
  riskReward: FxRiskReward;
  economicEventRisk: EconomicEventRisk;
  // エントリー候補からストップロスまでの距離がATRの何倍にあたるか
  stopDistanceAtrMultiple: number | null;
}

// TradeCoach AI FX版の中核方針：「エントリー回数を増やす」より「無理な場面で入らない」ことを優先する（要件11）。
// テクニカル的にBUY/SELLのスコア条件を満たしていても、以下のいずれかに該当すれば強制的にWAITへ切り替える。
// チェックは上から順に評価し、最初に該当した理由だけを採用する（複数該当してもWAITという結論は変わらないため）。
export function decideFxAction(inputs: DecisionInputs): FxDecisionResult {
  const { score, regime, multiTimeframe, riskReward, economicEventRisk, stopDistanceAtrMultiple } = inputs;

  const wantsBuy = score.buyScore >= DECISION_THRESHOLDS.buySellThreshold;
  const wantsSell = score.sellScore >= DECISION_THRESHOLDS.buySellThreshold;

  if (!wantsBuy && !wantsSell) {
    return {
      decision: "WAIT",
      confidence: Math.max(score.buyScore, score.sellScore),
      reasons: ["買い・売りいずれの方向にも十分な優位性が確認できません"],
      waitOverrideReason: null,
    };
  }

  const direction: "BUY" | "SELL" = wantsBuy ? "BUY" : "SELL";
  const directionLabel = direction === "BUY" ? "買い" : "売り";
  const confidence = wantsBuy ? score.buyScore : score.sellScore;

  if (multiTimeframe.agreement < DECISION_THRESHOLDS.minAgreement) {
    return {
      decision: "WAIT",
      confidence,
      reasons: [`テクニカル的には${directionLabel}寄りですが、上位足と下位足の方向感が一致していません`],
      waitOverrideReason: "上位足と下位足が逆行しており優位性が乏しいため見送りとしています",
    };
  }

  if (regime.state === "HIGH_VOLATILITY" && confidence < DECISION_THRESHOLDS.highVolatilityThreshold) {
    return {
      decision: "WAIT",
      confidence,
      reasons: ["値動きが荒く、通常より厳しい基準を満たせていません"],
      waitOverrideReason: "高ボラティリティ相場のためエントリー条件を厳格化しています",
    };
  }

  if (stopDistanceAtrMultiple !== null && stopDistanceAtrMultiple > DECISION_THRESHOLDS.maxStopDistanceAtrMultiple) {
    return {
      decision: "WAIT",
      confidence,
      reasons: [`エントリーからストップロスまでの距離がATRの${stopDistanceAtrMultiple.toFixed(1)}倍と遠く、損切りラインの想定が難しい状態です`],
      waitOverrideReason: "損切りまでの距離が遠すぎるため見送りとしています",
    };
  }

  if (riskReward.ratio > 0 && riskReward.ratio < DECISION_THRESHOLDS.minRiskReward) {
    return {
      decision: "WAIT",
      confidence,
      reasons: [`リスクリワード比が${riskReward.ratio.toFixed(2)}倍と、損失に対して利益が見合っていません`],
      waitOverrideReason: "リスクリワードが基準を下回るため見送りとしています",
    };
  }

  if (economicEventRisk.recommendation === "avoid_new_entries") {
    return {
      decision: "WAIT",
      confidence,
      reasons: [
        economicEventRisk.eventName
          ? `${economicEventRisk.eventName}の発表が近づいています`
          : "重要経済指標の発表が近づいています",
      ],
      waitOverrideReason: "重要経済指標の発表前後は新規エントリーを避けています",
    };
  }

  return {
    decision: direction,
    confidence,
    reasons: [`${directionLabel}方向の条件がそろっています`],
    waitOverrideReason: null,
  };
}
