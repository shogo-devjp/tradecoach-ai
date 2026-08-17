import { getFxPair } from "./config/pairs";
import { FX_TIMEFRAME_ORDER } from "./config/timeframes";
import { yahooFxProvider } from "./data/yahooFxProvider";
import { getCachedCandles, getCachedQuote, setCachedCandles, setCachedQuote } from "./data/cache";
import { analyzeFxPair } from "./analysis/analyzeFxPair";
import type { FxAnalysisResult, FxOHLCSeries, FxPairCode, FxTimeframe } from "./types";

// I/O層。実データ取得（Yahoo Finance）＋キャッシュ管理を行い、最後に純粋関数analyzeFxPairへ渡すだけの薄い層。
// 株式版のstockAnalysis.ts（I/O） と technicalAnalysis/analyze.ts（純粋ロジック）の分離構造を踏襲している。
export async function fetchFxAnalysis(pairCode: FxPairCode): Promise<FxAnalysisResult> {
  const pairDef = getFxPair(pairCode);

  const quote =
    getCachedQuote(pairCode) ?? setCachedQuote(pairCode, await yahooFxProvider.getQuote(pairDef));

  // 時間足ごとの取得はどれか1つが失敗しても分析全体を止めない
  // （マルチタイムフレーム分析は取得できた時間足だけで成立する設計になっている）。
  const seriesEntries = await Promise.all(
    FX_TIMEFRAME_ORDER.map(async (timeframe): Promise<[FxTimeframe, FxOHLCSeries | null]> => {
      const cached = getCachedCandles(pairCode, timeframe);
      if (cached) return [timeframe, cached];

      try {
        const series = await yahooFxProvider.getCandles(pairDef, timeframe);
        return [timeframe, setCachedCandles(pairCode, timeframe, series)];
      } catch (error) {
        console.error(`[fx] ${pairCode} ${timeframe}足の取得に失敗しました:`, error);
        return [timeframe, null];
      }
    })
  );

  const seriesByTimeframe: Partial<Record<FxTimeframe, FxOHLCSeries>> = {};
  for (const [timeframe, series] of seriesEntries) {
    if (series) seriesByTimeframe[timeframe] = series;
  }

  return analyzeFxPair({
    pair: pairCode,
    currentPrice: quote.price,
    seriesByTimeframe,
    now: new Date(),
  });
}
