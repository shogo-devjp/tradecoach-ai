import { REGIME_WEIGHT_MULTIPLIERS, SCORE_FACTOR_WEIGHTS, SESSION_CONFIDENCE_MULTIPLIER } from "../config/scoringWeights";
import type {
  FxScoreBreakdownItem,
  FxScoreResult,
  FxSessionState,
  MarketRegimeResult,
  MultiTimeframeResult,
  TimeframeAnalysis,
} from "../types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface FxScoreInputs {
  multiTimeframe: MultiTimeframeResult;
  regime: MarketRegimeResult;
  session: FxSessionState;
  currentPrice: number;
  // サポート・レジスタンスは節目として意味を持つ4時間足を基準にする
  srTimeframe: TimeframeAnalysis | null;
  // モメンタムは「現在のトレンド」に最も近い1時間足を基準にする
  momentumTimeframe: TimeframeAnalysis | null;
}

function resolveSessionMultiplier(session: FxSessionState): number {
  if (session.overlap === "LONDON_NEW_YORK" || session.overlap === "TOKYO_LONDON") {
    return SESSION_CONFIDENCE_MULTIPLIER.overlap;
  }
  if (session.activeSessions.includes("LONDON") || session.activeSessions.includes("NEW_YORK")) {
    return SESSION_CONFIDENCE_MULTIPLIER.singleMajor;
  }
  if (session.activeSessions.includes("TOKYO")) return SESSION_CONFIDENCE_MULTIPLIER.tokyoOnly;
  return SESSION_CONFIDENCE_MULTIPLIER.closed;
}

// BUY/SELLスコアは「各テクニカル指標を単純に足し算する」のではなく、以下の3段階で合成する。
// 1) 上位足トレンド・下位足トレンド・モメンタム・サポレジの4要素を、相場環境(regime)に応じて
//    重みを補正したうえで加重平均する（例：レンジ相場ではサポレジの重みを上げる）
// 2) 上位足と下位足の合意度(agreement)を掛け合わせ、方向感が割れているほどスコアを50点側へ減衰させる
// 3) セッション（流動性）による信頼度倍率を掛け合わせる
// 最終的に-1〜+1の確信度(conviction)を算出し、0〜100のBUY/SELLスコアに変換する。
export function calculateFxScore(inputs: FxScoreInputs): FxScoreResult {
  const { multiTimeframe, regime, session, currentPrice, srTimeframe, momentumTimeframe } = inputs;

  const higherTfTrend = clamp(multiTimeframe.higherTfBias, -1, 1);
  const lowerTfTrend = clamp(multiTimeframe.lowerTfBias, -1, 1);

  let supportResistance = 0;
  let srDetail = "サポート・レジスタンスの算出に必要なデータが不足しています";
  const support = srTimeframe?.indicators.support ?? null;
  const resistance = srTimeframe?.indicators.resistance ?? null;
  if (support !== null && resistance !== null) {
    const distanceToSupport = Math.abs(currentPrice - support);
    const distanceToResistance = Math.abs(resistance - currentPrice);
    const total = distanceToSupport + distanceToResistance;
    // レンジ内での現在値の位置を-1(レジスタンス直下)〜+1(サポート直上)に正規化する
    supportResistance = total > 0 ? clamp((distanceToResistance - distanceToSupport) / total, -1, 1) : 0;
    srDetail = `4時間足のサポート${support.toFixed(3)}・レジスタンス${resistance.toFixed(3)}に対する現在値の位置関係`;
  }

  let momentum = 0;
  let momentumDetail = "モメンタムの算出に必要なデータが不足しています";
  if (momentumTimeframe) {
    const rsi = momentumTimeframe.indicators.rsi14;
    const macdHistogram = momentumTimeframe.indicators.macdHistogram;
    const rsiScore = rsi !== null ? clamp((rsi - 50) / 25, -1, 1) : 0;
    const macdScore =
      macdHistogram !== null ? clamp(((macdHistogram / currentPrice) * 100) / 0.05, -1, 1) : 0;
    momentum = clamp(rsiScore * 0.5 + macdScore * 0.5, -1, 1);
    momentumDetail = "1時間足のRSI・MACDヒストグラムから算出";
  }

  const regimeMultipliers = REGIME_WEIGHT_MULTIPLIERS[regime.state] ?? {};
  const effectiveWeight = (key: keyof typeof SCORE_FACTOR_WEIGHTS): number =>
    SCORE_FACTOR_WEIGHTS[key] * (regimeMultipliers[key] ?? 1);

  const factors: { key: keyof typeof SCORE_FACTOR_WEIGHTS; value: number; label: string; detail: string }[] = [
    {
      key: "higherTfTrend",
      value: higherTfTrend,
      label: "上位足トレンド（日足・4時間足）",
      detail: `合成方向性スコア ${higherTfTrend.toFixed(2)}`,
    },
    {
      key: "lowerTfTrend",
      value: lowerTfTrend,
      label: "下位足トレンド（1時間・15分・5分足）",
      detail: `合成方向性スコア ${lowerTfTrend.toFixed(2)}`,
    },
    { key: "momentum", value: momentum, label: "モメンタム", detail: momentumDetail },
    { key: "supportResistance", value: supportResistance, label: "サポート・レジスタンス", detail: srDetail },
  ];

  const totalWeight = factors.reduce((sum, f) => sum + effectiveWeight(f.key), 0);
  const weightedSum = factors.reduce((sum, f) => sum + f.value * effectiveWeight(f.key), 0);
  const rawDirectional = totalWeight > 0 ? weightedSum / totalWeight : 0;

  const sessionMultiplier = resolveSessionMultiplier(session);
  const conviction = clamp(rawDirectional * multiTimeframe.agreement * sessionMultiplier, -1, 1);

  const buyScore = Math.round(((conviction + 1) / 2) * 100);
  const sellScore = 100 - buyScore;

  const breakdown: FxScoreBreakdownItem[] = factors.map((f) => ({
    label: f.label,
    contribution: f.value,
    weight: effectiveWeight(f.key),
    detail: f.detail,
  }));

  return { buyScore, sellScore, conviction, agreement: multiTimeframe.agreement, breakdown };
}
