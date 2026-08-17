import type { FxAnalysisResult, IndicatorSnapshot, Timeframe } from "./types";

// 要件20: 将来の検証（バックテスト・勝率分析）のためのログレコード型。
// Phase 1ではDB保存は行わず型定義のみ用意する。将来、この型のレコードをファイルやDBに
// 追記していけば、過去の判定を後から検証できるようになる（analyzeFxPairが現在時刻や
// リアルタイムAPIに依存しない純粋関数であることが前提。要件19）。
export interface FxAnalysisLogRecord {
  timestamp: number;
  pair: string; // CurrencyPairConfig.id
  price: number;
  timeframe: Timeframe; // ログの基準タイムフレーム（通常は"1h"などエントリー判断の主軸）
  marketRegimeTrend: FxAnalysisResult["marketRegime"]["trend"];
  marketRegimeVolatility: FxAnalysisResult["marketRegime"]["volatility"];
  buyScore: number;
  sellScore: number;
  finalDecision: FxAnalysisResult["decision"]["signal"];
  confidence: number;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: number;
  indicatorValuesByTimeframe: Partial<Record<Timeframe, IndicatorSnapshot>>;
}

export function buildFxAnalysisLogRecord(result: FxAnalysisResult, timeframe: Timeframe = "1h"): FxAnalysisLogRecord {
  const indicatorValuesByTimeframe: Partial<Record<Timeframe, IndicatorSnapshot>> = {};
  for (const tf of result.multiTimeframe.perTimeframe) {
    indicatorValuesByTimeframe[tf.timeframe] = tf.indicators;
  }

  return {
    timestamp: result.timestamp,
    pair: result.pair.id,
    price: result.price,
    timeframe,
    marketRegimeTrend: result.marketRegime.trend,
    marketRegimeVolatility: result.marketRegime.volatility,
    buyScore: result.score.buyScore,
    sellScore: result.score.sellScore,
    finalDecision: result.decision.signal,
    confidence: result.decision.confidence,
    entryLow: result.priceLevels.entryLow,
    entryHigh: result.priceLevels.entryHigh,
    stopLoss: result.priceLevels.stopLoss,
    takeProfit1: result.priceLevels.takeProfit1,
    takeProfit2: result.priceLevels.takeProfit2,
    riskReward: result.riskReward.ratio,
    indicatorValuesByTimeframe,
  };
}
