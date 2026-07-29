import { calculateSMA } from "./indicators/sma";
import type { TrendDirection } from "./types";

// 分足は日足のような75期間MAだと意味を持たない（60分足75本=約2週間、15分足75本=数日）ため、
// より短いSMA20 vs SMA50のクロス・位置関係で簡易的にトレンドを判定する。
const SHORT_PERIOD = 20;
const LONG_PERIOD = 50;

export function determineIntradayTrend(closes: number[]): TrendDirection | null {
  if (closes.length < LONG_PERIOD) return null;

  const shortMA = calculateSMA(closes, SHORT_PERIOD);
  const longMA = calculateSMA(closes, LONG_PERIOD);
  const last = closes.length - 1;
  const shortValue = shortMA[last];
  const longValue = longMA[last];
  if (shortValue === null || longValue === null) return null;

  const diffPercent = ((shortValue - longValue) / longValue) * 100;
  if (diffPercent > 0.3) return "上昇";
  if (diffPercent < -0.3) return "下降";
  return "横ばい";
}
