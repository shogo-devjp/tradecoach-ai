import { TIMEFRAMES } from "./types";
import type { AnalyzeFxPairOptions, CurrencyPairConfig, FxAnalysisResult, FxMultiTimeframeData, TimeframeAnalysis } from "./types";
import { FX_CONFIG } from "./config";
import { analyzeTimeframe } from "./analysis/timeframeAnalysis";
import { buildMultiTimeframeResult, findTimeframe } from "./analysis/multiTimeframe";
import { determineMarketRegime } from "./marketRegime/marketRegime";
import { getSessionInfo } from "./sessions/sessions";
import { calculateFxScore } from "./scoring/score";
import { calculatePriceLevels } from "./risk/priceLevels";
import { calculateRiskReward } from "./risk/riskReward";
import { computeTentativeDirection, decideFxSignal } from "./decision/decision";
import { generateFxComment } from "./comment/aiComment";
import { getDefaultEconomicEventRisk } from "./economicEvents";

// 要件19（最重要）: 売買判定ロジックは現在時刻やリアルタイムAPIに直接依存させない。
// OHLCデータ（FxMultiTimeframeData）とconfigだけを入力とする純粋関数にすることで、
// 過去データを渡せば同じロジックをバックテストにもそのまま使える。
// データ取得（Yahoo Finance等）は fxAnalysis.ts 側の非純粋なオーケストレーション層が担当する。
export function analyzeFxPair(
  pair: CurrencyPairConfig,
  data: FxMultiTimeframeData,
  options: AnalyzeFxPairOptions = {}
): FxAnalysisResult {
  const now = options.now ?? Date.now();
  const economicEventRisk = options.economicEventRisk ?? getDefaultEconomicEventRisk();

  const perTimeframe = TIMEFRAMES.map((tf) => analyzeTimeframe(tf, data[tf])).filter(
    (tf): tf is TimeframeAnalysis => tf !== null
  );

  if (perTimeframe.length === 0) {
    return buildInsufficientDataResult(pair, data, now, economicEventRisk);
  }

  const multiTimeframe = buildMultiTimeframeResult(perTimeframe, FX_CONFIG.timeframeWeights);
  const fourHour = findTimeframe(perTimeframe, "4h") ?? null;
  const marketRegime = determineMarketRegime(fourHour);
  const session = getSessionInfo(new Date(now));

  const score = calculateFxScore(multiTimeframe, marketRegime, session, FX_CONFIG.scoreWeights, FX_CONFIG.timeframeWeights);

  // 価格レベルの基準は「現在のトレンド」を担う1時間足を使う（要件3の考え方に沿う）。
  const oneHour = findTimeframe(perTimeframe, "1h") ?? fourHour ?? perTimeframe[perTimeframe.length - 1];
  const tentativeDirection = computeTentativeDirection(score);
  const atr = oneHour.indicators.atr14 ?? oneHour.currentPrice * 0.001;
  const priceLevels = calculatePriceLevels({
    currentPrice: oneHour.currentPrice,
    atr,
    support: oneHour.indicators.support,
    resistance: oneHour.indicators.resistance,
    direction: tentativeDirection,
    pair,
  });
  const riskReward = calculateRiskReward(priceLevels, tentativeDirection);

  const decision = decideFxSignal({ score, multiTimeframe, marketRegime, priceLevels, riskReward, economicEventRisk });

  const aiComment = generateFxComment({
    pair,
    price: oneHour.currentPrice,
    decision,
    marketRegime,
    session,
    multiTimeframe,
    priceLevels,
    riskReward,
  });

  return {
    pair,
    price: oneHour.currentPrice,
    timestamp: now,
    marketRegime,
    session,
    multiTimeframe,
    score,
    decision,
    priceLevels,
    riskReward,
    aiComment,
    economicEventRisk,
  };
}

function buildInsufficientDataResult(
  pair: CurrencyPairConfig,
  data: FxMultiTimeframeData,
  now: number,
  economicEventRisk: ReturnType<typeof getDefaultEconomicEventRisk>
): FxAnalysisResult {
  const anyBar = TIMEFRAMES.map((tf) => data[tf]?.[data[tf].length - 1]).find((bar) => bar !== undefined);
  const price = anyBar?.close ?? 0;
  const session = getSessionInfo(new Date(now));

  return {
    pair,
    price,
    timestamp: now,
    marketRegime: { trend: "RANGE", volatility: "NORMAL_VOLATILITY", label: "判定不可（データ不足）", adx: 0, atrPercent: 0 },
    session,
    multiTimeframe: { perTimeframe: [], directions: [], higherLowerConflict: false, alignmentScore: 0 },
    score: { buyScore: 0, sellScore: 0, components: [] },
    decision: {
      signal: "待ち",
      confidence: 0,
      reasons: ["分析に必要な過去データが不足しています"],
      waitReasonCodes: ["TREND_UNCLEAR"],
    },
    priceLevels: { entryLow: price, entryHigh: price, stopLoss: price, takeProfit1: price, takeProfit2: price },
    riskReward: { ratio: 0, isAcceptable: false },
    aiComment: "分析に必要な過去データが不足しているため、判断を保留します。しばらく値動きを確認してから改めて分析することをおすすめします。",
    economicEventRisk,
  };
}
