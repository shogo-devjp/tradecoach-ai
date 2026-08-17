import type { OHLCSeries, OHLCSeriesArrays } from "../types";

// OHLCSeries（バーの配列）を、既存の株式版indicators（calculateSMA等）がそのまま使える
// number[]の並列配列に変換する。株式版のindicatorsモジュールは「価格の配列」という
// 汎用的な数値計算のみを行っており銘柄固有の前提を持たないため、この変換を介して再利用する。
export function toArrays(series: OHLCSeries): OHLCSeriesArrays {
  return {
    times: series.map((b) => b.time),
    opens: series.map((b) => b.open),
    highs: series.map((b) => b.high),
    lows: series.map((b) => b.low),
    closes: series.map((b) => b.close),
  };
}
