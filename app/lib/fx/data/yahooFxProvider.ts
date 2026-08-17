import YahooFinance from "yahoo-finance2";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import type { FxPairDefinition } from "../config/pairs";
import { FX_TIMEFRAME_CONFIG } from "../config/timeframes";
import type { FxOHLCSeries, FxTimeframe } from "../types";
import type { FxDataProvider, FxQuote } from "./types";
import { resampleToHours } from "./resample";

const yahooFinance = new YahooFinance();

// 為替のyahoo-finance2 chart()はvolumeが常に0または欠損であることが多く、実際の売買高ではない
// （株式の出来高ロジックをそのまま流用しない、という方針の一環）。0以下は「データなし」としてnullにする。
function buildFxSeries(chart: ChartResultArray): FxOHLCSeries {
  const quotes = chart.quotes.filter(
    (q) => q.close !== null && q.high !== null && q.low !== null && q.open !== null
  );

  return {
    times: quotes.map((q) => Math.floor(q.date.getTime() / 1000)),
    opens: quotes.map((q) => q.open as number),
    highs: quotes.map((q) => q.high as number),
    lows: quotes.map((q) => q.low as number),
    closes: quotes.map((q) => q.close as number),
    tickVolumes: quotes.map((q) => (q.volume && q.volume > 0 ? q.volume : null)),
  };
}

// Phase 1のデータ取得元。個人利用でAPIキー登録不要・追加コストなしという条件を優先し、
// 株式版と同じ yahoo-finance2 を採用する（非公式APIである点は要留意。README参照）。
export const yahooFxProvider: FxDataProvider = {
  async getQuote(pairDef: FxPairDefinition): Promise<FxQuote> {
    const quote = await yahooFinance.quote(pairDef.yahooSymbol);
    return {
      price: quote.regularMarketPrice ?? 0,
      time: Math.floor(Date.now() / 1000),
    };
  },

  async getCandles(pairDef: FxPairDefinition, timeframe: FxTimeframe): Promise<FxOHLCSeries> {
    const config = FX_TIMEFRAME_CONFIG[timeframe];
    const period1 = new Date();
    period1.setDate(period1.getDate() - config.lookbackDays);

    const chart = await yahooFinance.chart(pairDef.yahooSymbol, {
      period1,
      interval: config.yahooInterval,
    });
    const series = buildFxSeries(chart);

    // 4時間足はYahoo非対応のため60分足から合成する
    if (config.resampleFactor && timeframe === "4h") {
      return resampleToHours(series, 4);
    }
    return series;
  },
};
