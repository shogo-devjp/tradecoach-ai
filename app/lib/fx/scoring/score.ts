import type {
  FxScoreResult,
  MarketRegime,
  MultiTimeframeResult,
  ScoreComponent,
  ScoreWeights,
  SessionInfo,
  Timeframe,
  TimeframeAnalysis,
  TimeframeWeights,
} from "../types";
import { findTimeframe } from "../analysis/multiTimeframe";

const DIRECTION_VALUE: Record<TimeframeAnalysis["direction"], number> = { up: 1, flat: 0, down: -1 };
const MOMENTUM_VALUE: Record<TimeframeAnalysis["momentumStatus"], number> = { positive: 1, neutral: 0, negative: -1 };

// FX専用スコアリングエンジン。要件8「各テクニカル指標を単純に足し算するだけにしない」に対応するため、
// 個々の指標ではなく「上位足トレンド」「下位足トレンド」「モメンタム」「サポレジ」「ボラティリティ」
// 「相場環境」「セッション」という意味のあるブロック単位でウェイト付けする。
//
// 前半5要素（higherTimeframeTrend〜marketRegime）は「方向性」（-1=弱気〜+1=強気）を持つ。
// 後半2要素（volatility, session）は方向を持たず、「今のコンディションがどれだけ信頼できるか」
// （0=悪条件〜1=良条件）を表し、方向性から出たBUY/SELLの生スコアに掛かる信頼度係数として働く。
// これにより「高ボラティリティ時はエントリー条件を厳しくする」（要件5）を、方向を歪めずに実現する。
export function calculateFxScore(
  multiTimeframe: MultiTimeframeResult,
  marketRegime: MarketRegime,
  session: SessionInfo,
  weights: ScoreWeights,
  timeframeWeights: TimeframeWeights
): FxScoreResult {
  const higherTrend = groupTrendValue(multiTimeframe, timeframeWeights, ["1d", "4h"]);
  const lowerTrend = groupTrendValue(multiTimeframe, timeframeWeights, ["1h", "15m", "5m"]);
  const momentum = groupMomentumValue(multiTimeframe, ["4h", "1h"]);
  const supportResistance = supportResistanceValue(multiTimeframe);
  const regimeAlignment = marketRegime.trend === "TREND_UP" ? 1 : marketRegime.trend === "TREND_DOWN" ? -1 : 0;
  const volatilityReliability = volatilityReliabilityValue(marketRegime);
  const sessionReliability = sessionReliabilityValue(session);

  const components: ScoreComponent[] = [
    {
      label: "上位足トレンド（日足・4時間足）",
      weight: weights.higherTimeframeTrend,
      value: higherTrend,
      contribution: round3(weights.higherTimeframeTrend * higherTrend),
      note: describeDirectional(higherTrend, "上位足"),
    },
    {
      label: "下位足トレンド（1時間・15分・5分足）",
      weight: weights.lowerTimeframeTrend,
      value: lowerTrend,
      contribution: round3(weights.lowerTimeframeTrend * lowerTrend),
      note: describeDirectional(lowerTrend, "下位足"),
    },
    {
      label: "モメンタム（RSI・MACD）",
      weight: weights.momentum,
      value: momentum,
      contribution: round3(weights.momentum * momentum),
      note: describeDirectional(momentum, "モメンタム"),
    },
    {
      label: "サポート・レジスタンス",
      weight: weights.supportResistance,
      value: supportResistance,
      contribution: round3(weights.supportResistance * supportResistance),
      note: describeDirectional(supportResistance, "価格の位置関係"),
    },
    {
      label: "相場環境（トレンド/レンジ）",
      weight: weights.marketRegime,
      value: regimeAlignment,
      contribution: round3(weights.marketRegime * regimeAlignment),
      note: `相場環境は${marketRegime.label}`,
    },
    {
      label: "ボラティリティ",
      weight: weights.volatility,
      value: volatilityReliability,
      contribution: round3(weights.volatility * volatilityReliability),
      note: `ボラティリティ状態: ${marketRegime.volatility}（信頼度係数 ${volatilityReliability.toFixed(2)}）`,
    },
    {
      label: "セッション（市場時間）",
      weight: weights.session,
      value: sessionReliability,
      contribution: round3(weights.session * sessionReliability),
      note: `${session.label}（信頼度係数 ${sessionReliability.toFixed(2)}）`,
    },
  ];

  const directionalWeightTotal =
    weights.higherTimeframeTrend + weights.lowerTimeframeTrend + weights.momentum + weights.supportResistance + weights.marketRegime;
  const directionalRaw =
    weights.higherTimeframeTrend * higherTrend +
    weights.lowerTimeframeTrend * lowerTrend +
    weights.momentum * momentum +
    weights.supportResistance * supportResistance +
    weights.marketRegime * regimeAlignment;
  const directionalNormalized = directionalWeightTotal > 0 ? directionalRaw / directionalWeightTotal : 0;

  const reliabilityWeightTotal = weights.volatility + weights.session;
  const reliabilityRaw = weights.volatility * volatilityReliability + weights.session * sessionReliability;
  // 0.5〜1.0の範囲に収め、条件が悪くてもスコアが0になり切らないようにする
  // （ボラティリティ・セッションはあくまで信頼度の微調整であり、方向性判断そのものを消し去らないため）
  const reliabilityNormalized = reliabilityWeightTotal > 0 ? reliabilityRaw / reliabilityWeightTotal : 1;
  const reliabilityFactor = 0.5 + Math.max(0, Math.min(1, reliabilityNormalized)) * 0.5;

  const bullMagnitude = Math.max(0, directionalNormalized);
  const bearMagnitude = Math.max(0, -directionalNormalized);

  const buyScore = Math.round(bullMagnitude * 100 * reliabilityFactor);
  const sellScore = Math.round(bearMagnitude * 100 * reliabilityFactor);

  return { buyScore, sellScore, components };
}

function groupTrendValue(multiTimeframe: MultiTimeframeResult, timeframeWeights: TimeframeWeights, group: Timeframe[]): number {
  let sum = 0;
  let weightTotal = 0;
  for (const tf of group) {
    const analysis = findTimeframe(multiTimeframe.perTimeframe, tf);
    if (!analysis) continue;
    const weight = timeframeWeights[tf];
    sum += DIRECTION_VALUE[analysis.direction] * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? sum / weightTotal : 0;
}

function groupMomentumValue(multiTimeframe: MultiTimeframeResult, group: Timeframe[]): number {
  const values = group
    .map((tf) => findTimeframe(multiTimeframe.perTimeframe, tf))
    .filter((tf): tf is TimeframeAnalysis => !!tf)
    .map((tf) => MOMENTUM_VALUE[tf.momentumStatus]);
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// 1時間足を基準に、現在値がサポート・レジスタンスのどちらに近いかを見る。
// サポート付近＝反発期待（買い材料）、レジスタンス付近＝上値が重い（売り材料）とする。
function supportResistanceValue(multiTimeframe: MultiTimeframeResult): number {
  const oneHour = findTimeframe(multiTimeframe.perTimeframe, "1h");
  if (!oneHour) return 0;
  const { support, resistance } = oneHour.indicators;
  if (support === null || resistance === null || resistance <= support) return 0;

  const price = oneHour.currentPrice;
  const range = resistance - support;
  const distanceToSupport = (price - support) / range; // 0=support上, 1=resistance上
  const distanceToResistance = 1 - distanceToSupport;

  const proximityThreshold = 0.15; // レンジ幅の15%以内に接近していたら反応させる
  if (distanceToSupport <= proximityThreshold) {
    return 1 - distanceToSupport / proximityThreshold; // support直上ほど+1に近づく
  }
  if (distanceToResistance <= proximityThreshold) {
    return -(1 - distanceToResistance / proximityThreshold); // resistance直下ほど-1に近づく
  }
  return 0;
}

function volatilityReliabilityValue(marketRegime: MarketRegime): number {
  if (marketRegime.volatility === "HIGH_VOLATILITY") return 0.3;
  if (marketRegime.volatility === "LOW_VOLATILITY") return 0.7;
  return 1;
}

function sessionReliabilityValue(session: SessionInfo): number {
  if (session.isOverlap) return 1;
  if (session.activeSessions.includes("OFF_HOURS")) return 0.4;
  return 0.8;
}

function describeDirectional(value: number, label: string): string {
  if (value > 0.2) return `${label}は買い方向`;
  if (value < -0.2) return `${label}は売り方向`;
  return `${label}は方向感に乏しい`;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
