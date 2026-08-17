import YahooFinance from "yahoo-finance2";
import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import type { CurrencyPairConfig, FxMultiTimeframeData, OHLCSeries } from "../types";
import { aggregateToFourHour } from "./aggregate";

// データ取得方法の調査結果（要件15）:
// Yahoo Finance（yahoo-finance2、株式版と同じ既存依存）は USDJPY=X のような為替シンボルに対応しており、
// APIキー不要・無料・5分/15分/60分/日足の履歴データを取得できることを確認済み。
// 個人利用の準リアルタイム分析用途であれば料金・制限・取得可能な足種の面で最も現実的な選択のため、
// Phase 1のデータソースとして採用する（詳細な比較は実装後レポートに記載）。
const yahooFinance = new YahooFinance();

function chartToSeries(chart: ChartResultArray): OHLCSeries {
  return chart.quotes
    .filter((q) => q.close !== null && q.high !== null && q.low !== null && q.open !== null)
    .map((q) => ({
      time: q.date.getTime(),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      // Yahoo Financeの為替チャートはvolumeが常に0（インターバンク市場に出来高の概念がないため）。
      // 意味を持たない値をtickVolumeとして扱わないようundefinedのままにする。
      tickVolume: undefined,
    }));
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export interface FxQuote {
  price: number;
  time: number;
}

export async function fetchFxQuote(pair: CurrencyPairConfig): Promise<FxQuote> {
  const quote = await yahooFinance.quote(pair.yahooSymbol);
  return {
    price: quote.regularMarketPrice ?? 0,
    time: quote.regularMarketTime ? new Date(quote.regularMarketTime).getTime() : Date.now(),
  };
}

// 5分・15分・1時間・日足をYahoo Financeから取得し、4時間足は1時間足を集約して合成する
// （Yahoo Financeが4時間足を直接提供していないため）。
export async function fetchFxMultiTimeframeData(pair: CurrencyPairConfig): Promise<FxMultiTimeframeData> {
  const [chart5m, chart15m, chart60m, chart1d] = await Promise.all([
    yahooFinance.chart(pair.yahooSymbol, { period1: daysAgo(3), interval: "5m" }),
    yahooFinance.chart(pair.yahooSymbol, { period1: daysAgo(7), interval: "15m" }),
    yahooFinance.chart(pair.yahooSymbol, { period1: daysAgo(30), interval: "60m" }),
    yahooFinance.chart(pair.yahooSymbol, { period1: daysAgo(400), interval: "1d" }),
  ]);

  const series60m = chartToSeries(chart60m);

  return {
    "5m": chartToSeries(chart5m),
    "15m": chartToSeries(chart15m),
    "1h": series60m,
    "4h": aggregateToFourHour(series60m),
    "1d": chartToSeries(chart1d),
  };
}
