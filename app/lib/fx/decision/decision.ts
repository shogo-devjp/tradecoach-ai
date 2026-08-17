import type {
  EconomicEventRisk,
  FxDecision,
  FxPriceLevels,
  FxScoreResult,
  MarketRegime,
  MultiTimeframeResult,
  RiskRewardResult,
  WaitReasonCode,
} from "../types";
import { FX_CONFIG } from "../config";
import { findTimeframe } from "../analysis/multiTimeframe";
import type { TentativeDirection } from "../risk/priceLevels";

interface DecisionInputs {
  score: FxScoreResult;
  multiTimeframe: MultiTimeframeResult;
  marketRegime: MarketRegime;
  priceLevels: FxPriceLevels;
  riskReward: RiskRewardResult;
  economicEventRisk: EconomicEventRisk;
}

const WAIT_REASON_LABEL: Record<WaitReasonCode, string> = {
  TREND_UNCLEAR: "トレンドが不明確（BUY/SELLどちらの根拠も弱い、または拮抗している）",
  HIGHER_LOWER_CONFLICT: "上位足と下位足のトレンドが逆方向を向いている",
  EXTREME_VOLATILITY: "ボラティリティが極端に高く値動きが荒い",
  STOP_TOO_FAR: "Entryから損切りまでの距離が遠すぎる",
  POOR_RISK_REWARD: "リスクリワードが悪い",
  MID_RANGE_SR: "主要サポート・レジスタンスの中間で明確な根拠がない",
  INDICATOR_CONFLICT: "上位足トレンドとモメンタムが矛盾している",
  ECONOMIC_EVENT_RISK: "重要経済指標の発表が近く新規エントリーを避けるべき時間帯",
};

// 「今は入らない方がいい」を重視する（要件11）。エントリー回数を増やすことより、
// 無理な場面ではWAITを積極的に返すことを最優先の設計方針とする。
export function computeTentativeDirection(score: FxScoreResult): TentativeDirection {
  const cfg = FX_CONFIG.decision;
  if (score.buyScore >= cfg.minScoreForSignal && score.buyScore > score.sellScore) return "buy";
  if (score.sellScore >= cfg.minScoreForSignal && score.sellScore > score.buyScore) return "sell";
  return "none";
}

export function decideFxSignal(inputs: DecisionInputs): FxDecision {
  const { score, multiTimeframe, marketRegime, priceLevels, riskReward, economicEventRisk } = inputs;
  const cfg = FX_CONFIG.decision;
  const waitReasonCodes: WaitReasonCode[] = [];

  const scoreGap = Math.abs(score.buyScore - score.sellScore);
  const tentativeDirection: TentativeDirection = computeTentativeDirection(score);

  if (tentativeDirection === "none" || scoreGap < cfg.minScoreGap) {
    waitReasonCodes.push("TREND_UNCLEAR");
  }

  if (multiTimeframe.higherLowerConflict) {
    waitReasonCodes.push("HIGHER_LOWER_CONFLICT");
  }

  if (marketRegime.volatility === "HIGH_VOLATILITY" && marketRegime.atrPercent >= FX_CONFIG.regime.highVolatilityAtrPercent * 1.8) {
    waitReasonCodes.push("EXTREME_VOLATILITY");
  }

  if (tentativeDirection !== "none") {
    const entry = tentativeDirection === "sell" ? priceLevels.entryLow : priceLevels.entryHigh;
    const oneHourAtr = findTimeframe(multiTimeframe.perTimeframe, "1h")?.indicators.atr14 ?? null;
    if (oneHourAtr && oneHourAtr > 0) {
      const stopDistance = Math.abs(entry - priceLevels.stopLoss);
      if (stopDistance > oneHourAtr * cfg.maxStopDistanceAtrMultiple) {
        waitReasonCodes.push("STOP_TOO_FAR");
      }
    }
  }

  if (tentativeDirection !== "none" && !riskReward.isAcceptable) {
    waitReasonCodes.push("POOR_RISK_REWARD");
  }

  if (marketRegime.trend === "RANGE" && isMidRange(multiTimeframe, cfg.midRangeBandPercent)) {
    waitReasonCodes.push("MID_RANGE_SR");
  }

  const higherTrendComponent = score.components.find((c) => c.label.startsWith("上位足"));
  const momentumComponent = score.components.find((c) => c.label.startsWith("モメンタム"));
  if (
    higherTrendComponent &&
    momentumComponent &&
    Math.abs(higherTrendComponent.value) > 0.3 &&
    Math.sign(higherTrendComponent.value) !== Math.sign(momentumComponent.value) &&
    momentumComponent.value !== 0
  ) {
    waitReasonCodes.push("INDICATOR_CONFLICT");
  }

  if (economicEventRisk.isNearHighImpactEvent) {
    waitReasonCodes.push("ECONOMIC_EVENT_RISK");
  }

  const uniqueCodes = Array.from(new Set(waitReasonCodes));
  const finalSignal = uniqueCodes.length > 0 || tentativeDirection === "none" ? "待ち" : tentativeDirection === "buy" ? "買い" : "売り";

  const confidence =
    finalSignal === "待ち"
      ? Math.max(score.buyScore, score.sellScore, 0)
      : finalSignal === "買い"
        ? score.buyScore
        : score.sellScore;

  const reasons = buildReasons(finalSignal, tentativeDirection, uniqueCodes, score, marketRegime, multiTimeframe);

  return { signal: finalSignal, confidence, reasons, waitReasonCodes: uniqueCodes };
}

// 現在値がレンジの中間（サポレジどちらからも遠い）にあるかどうかを判定する
function isMidRange(multiTimeframe: MultiTimeframeResult, midRangeBandPercent: number): boolean {
  const oneHour = findTimeframe(multiTimeframe.perTimeframe, "1h");
  if (!oneHour) return false;
  const { support, resistance } = oneHour.indicators;
  if (support === null || resistance === null || resistance <= support) return false;

  const range = resistance - support;
  const midLow = support + range * (0.5 - midRangeBandPercent / 2);
  const midHigh = support + range * (0.5 + midRangeBandPercent / 2);
  return oneHour.currentPrice >= midLow && oneHour.currentPrice <= midHigh;
}

function buildReasons(
  signal: FxDecision["signal"],
  tentativeDirection: TentativeDirection,
  waitCodes: WaitReasonCode[],
  score: FxScoreResult,
  marketRegime: MarketRegime,
  multiTimeframe: MultiTimeframeResult
): string[] {
  const reasons: string[] = [];

  if (signal !== "待ち") {
    reasons.push(`BUYスコア ${score.buyScore}点 / SELLスコア ${score.sellScore}点`);
    reasons.push(`相場環境: ${marketRegime.label}`);
    for (const component of score.components) {
      if (Math.abs(component.value) > 0.3) {
        reasons.push(component.note);
      }
    }
    return reasons;
  }

  if (tentativeDirection === "none") {
    reasons.push(`BUYスコア ${score.buyScore}点 / SELLスコア ${score.sellScore}点で明確な優位性がありません`);
  }
  for (const code of waitCodes) {
    reasons.push(WAIT_REASON_LABEL[code]);
  }
  if (multiTimeframe.higherLowerConflict) {
    reasons.push("上位足と下位足の方向性が一致するまで待つのが安全です");
  }
  if (reasons.length === 0) {
    reasons.push("明確な優位性が確認できないため待機します");
  }
  return reasons;
}
