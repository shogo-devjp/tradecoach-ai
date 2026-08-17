import { getFxPair } from "../config/pairs";
import { FX_TIMEFRAME_ORDER } from "../config/timeframes";
import { getEconomicEventRisk } from "../economicEvents/economicEventRisk";
import { detectMarketRegime } from "../marketRegime/detectRegime";
import { calculateFxScore } from "../scoring/score";
import { calculateFxPriceLevels } from "../risk/priceLevels";
import { calculateFxRiskReward } from "../risk/riskReward";
import { decideFxAction } from "../risk/decision";
import { determineFxSession } from "../sessions/sessions";
import type {
  FxAnalysisResult,
  FxOHLCSeries,
  FxPairCode,
  FxTimeframe,
  MarketRegimeResult,
  MultiTimeframeResult,
  TimeframeAnalysis,
} from "../types";
import { analyzeTimeframe } from "./timeframeAnalysis";
import { combineMultiTimeframe } from "./multiTimeframe";
import { buildFxReasons } from "./reasons";
import { generateFxCoachComment } from "./coach";

export interface AnalyzeFxPairInput {
  pair: FxPairCode;
  currentPrice: number;
  // 時間足ごとのローソク足データ。データが取得できなかった時間足は省略してよい
  // （その時間足はマルチタイムフレーム分析から除外されるだけで、全体は落ちない）。
  seriesByTimeframe: Partial<Record<FxTimeframe, FxOHLCSeries>>;
  // セッション判定・経済指標判定の基準時刻。呼び出し側が明示的に渡す。
  // 要件19（バックテスト可能な設計）を満たすため、この関数の内部でDate.now()やAPI呼び出しは一切行わない。
  // 過去のOHLCデータと過去の時刻を渡せば、過去時点の分析を現在と全く同じロジックで再現できる。
  now: Date;
}

// FXエンジンの中核となる純粋関数。I/O（データ取得）は一切行わず、渡されたデータのみから
// 相場環境判定・マルチタイムフレーム分析・スコアリング・売買判定・価格レベル算出までを行う。
export function analyzeFxPair(input: AnalyzeFxPairInput): FxAnalysisResult {
  const { pair, currentPrice, seriesByTimeframe, now } = input;
  const pairDef = getFxPair(pair);

  const byTimeframe: Partial<Record<FxTimeframe, TimeframeAnalysis>> = {};
  for (const tf of FX_TIMEFRAME_ORDER) {
    const series = seriesByTimeframe[tf];
    if (!series) continue;
    const analyzed = analyzeTimeframe(tf, series);
    if (analyzed) byTimeframe[tf] = analyzed;
  }

  if (Object.keys(byTimeframe).length === 0) {
    return buildInsufficientDataResult(pair, currentPrice, now);
  }

  const multiTimeframe = combineMultiTimeframe(byTimeframe);
  const trendTimeframe = byTimeframe["4h"] ?? null;
  const volatilityTimeframe = byTimeframe["1h"] ?? trendTimeframe;
  const regime = detectMarketRegime(trendTimeframe, volatilityTimeframe);
  const session = determineFxSession(now);
  const economicEventRisk = getEconomicEventRisk(pair, now);

  const srTimeframe = byTimeframe["4h"] ?? trendTimeframe;
  const momentumTimeframe = byTimeframe["1h"] ?? volatilityTimeframe;

  const score = calculateFxScore({
    multiTimeframe,
    regime,
    session,
    currentPrice,
    srTimeframe,
    momentumTimeframe,
  });

  // WAITになる可能性も含め、表示用の価格レベルはスコアの向き（conviction）で暫定的に決める
  const provisionalDirection: "BUY" | "SELL" = score.conviction >= 0 ? "BUY" : "SELL";
  const atrReference = momentumTimeframe?.indicators.atr14 ?? currentPrice * 0.001;

  const priceLevels = calculateFxPriceLevels({
    currentPrice,
    atr: atrReference,
    srTimeframe,
    direction: provisionalDirection,
    priceDecimals: pairDef.priceDecimals,
  });

  const entryReference = (priceLevels.entryLow + priceLevels.entryHigh) / 2;
  const riskReward = calculateFxRiskReward(
    entryReference,
    priceLevels.stopLoss,
    priceLevels.takeProfit1,
    pairDef.pipSize
  );
  const stopDistanceAtrMultiple =
    atrReference > 0 ? Math.abs(entryReference - priceLevels.stopLoss) / atrReference : null;

  const decision = decideFxAction({
    score,
    regime,
    multiTimeframe,
    riskReward,
    economicEventRisk,
    stopDistanceAtrMultiple,
  });

  const reasons = buildFxReasons({ regime, multiTimeframe, riskReward });
  const coachComment = generateFxCoachComment({
    pairDisplayName: pairDef.displayName,
    decision,
    regime,
    multiTimeframe,
    priceLevels,
    riskReward,
    session,
  });

  return {
    pair,
    currentPrice,
    regime,
    session,
    multiTimeframe,
    score,
    decision,
    priceLevels,
    riskReward,
    economicEventRisk,
    coachComment,
    reasons,
  };
}

function buildInsufficientDataResult(pair: FxPairCode, currentPrice: number, now: Date): FxAnalysisResult {
  const regime: MarketRegimeResult = {
    state: "RANGE",
    volatilityLevel: "normal",
    adx: null,
    atrPercent: null,
    bbWidthPercent: null,
    comment: "分析に必要な過去データが不足しています。",
  };
  const multiTimeframe: MultiTimeframeResult = {
    byTimeframe: {} as Record<FxTimeframe, TimeframeAnalysis>,
    agreement: 0,
    higherTfBias: 0,
    lowerTfBias: 0,
  };
  const session = determineFxSession(now);

  return {
    pair,
    currentPrice,
    regime,
    session,
    multiTimeframe,
    score: { buyScore: 50, sellScore: 50, conviction: 0, agreement: 0, breakdown: [] },
    decision: {
      decision: "WAIT",
      confidence: 0,
      reasons: ["過去データが不足しているため十分な分析ができません"],
      waitOverrideReason: "データ不足のため本日は判定できません",
    },
    priceLevels: {
      entryLow: currentPrice,
      entryHigh: currentPrice,
      stopLoss: currentPrice,
      takeProfit1: currentPrice,
      takeProfit2: currentPrice,
    },
    riskReward: { ratio: 0, riskPips: 0, rewardPips: 0 },
    economicEventRisk: getEconomicEventRisk(pair, now),
    coachComment: "過去データが不足しているため、十分な分析ができません。しばらく値動きを確認してから判断することをおすすめします。",
    reasons: ["過去データが不足しているため十分な根拠を提示できません"],
  };
}
