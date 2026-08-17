import { calculateEMA } from "@/app/lib/technicalAnalysis/indicators/ema";
import { calculateSMA } from "@/app/lib/technicalAnalysis/indicators/sma";
import { calculateRSI } from "@/app/lib/technicalAnalysis/indicators/rsi";
import { calculateMACD } from "@/app/lib/technicalAnalysis/indicators/macd";
import { calculateATR } from "@/app/lib/technicalAnalysis/indicators/atr";
import { calculateBollingerBands } from "../indicators/bollinger";
import { calculateADX } from "../indicators/adx";
import { findSupportResistance } from "../indicators/supportResistance";
import { toArrays } from "../indicators/series";
import type { FxDirection, IndicatorSnapshot, IndicatorStatus, OHLCSeries, Timeframe, TimeframeAnalysis } from "../types";

// 各時間足を安定して計算するために必要な最低本数（SMA20・EMA200・ADX14が計算できる余裕を見る）
const MIN_BARS = 60;

export function analyzeTimeframe(timeframe: Timeframe, series: OHLCSeries): TimeframeAnalysis | null {
  if (series.length < MIN_BARS) return null;

  const { highs, lows, closes } = toArrays(series);
  const last = closes.length - 1;
  const currentPrice = closes[last];

  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200Raw = closes.length >= 200 ? calculateEMA(closes, 200) : null;
  const sma20 = calculateSMA(closes, 20);
  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const atr = calculateATR(highs, lows, closes, 14);
  const bollinger = calculateBollingerBands(closes, 20, 2);
  const adx = calculateADX(highs, lows, closes, 14);
  const sr = findSupportResistance(highs, lows, 40);

  const atrValue = atr[last] ?? null;
  const atrPercent = atrValue !== null ? (atrValue / currentPrice) * 100 : null;

  const indicators: IndicatorSnapshot = {
    ema20: ema20[last],
    ema50: ema50[last],
    ema200: ema200Raw ? ema200Raw[last] : null,
    sma20: sma20[last],
    rsi14: rsi[last],
    macdLine: macd.macdLine[last],
    macdSignal: macd.signalLine[last],
    macdHistogram: macd.histogram[last],
    atr14: atrValue,
    atrPercent,
    bollingerUpper: bollinger.upper[last],
    bollingerLower: bollinger.lower[last],
    bollingerMiddle: bollinger.middle[last],
    bollingerWidthPercent: bollinger.widthPercent[last],
    adx14: adx.adx[last],
    support: sr.support,
    resistance: sr.resistance,
    recentHigh: sr.recentHigh,
    recentLow: sr.recentLow,
  };

  const { direction, trendStatus } = determineDirection(currentPrice, indicators);
  const momentumStatus = determineMomentumStatus(indicators);
  const note = buildNote(timeframe, direction, indicators);

  return { timeframe, currentPrice, indicators, direction, trendStatus, momentumStatus, note };
}

// EMA20/EMA50の並びと現在値の位置関係でこの時間足単体の方向を判定する。
// 「現在値 > EMA20 > EMA50」なら上昇、逆なら下降、それ以外は横ばい（レンジ）とする。
function determineDirection(
  price: number,
  ind: IndicatorSnapshot
): { direction: FxDirection; trendStatus: IndicatorStatus } {
  const { ema20, ema50 } = ind;
  if (ema20 === null || ema50 === null) return { direction: "flat", trendStatus: "neutral" };

  if (price > ema20 && ema20 > ema50) return { direction: "up", trendStatus: "positive" };
  if (price < ema20 && ema20 < ema50) return { direction: "down", trendStatus: "negative" };
  return { direction: "flat", trendStatus: "neutral" };
}

function determineMomentumStatus(ind: IndicatorSnapshot): IndicatorStatus {
  const { rsi14, macdHistogram } = ind;
  if (rsi14 === null || macdHistogram === null) return "neutral";

  const rsiScore = rsi14 > 55 ? 1 : rsi14 < 45 ? -1 : 0;
  const macdScore = macdHistogram > 0 ? 1 : macdHistogram < 0 ? -1 : 0;
  const total = rsiScore + macdScore;

  if (total > 0) return "positive";
  if (total < 0) return "negative";
  return "neutral";
}

function buildNote(timeframe: Timeframe, direction: FxDirection, ind: IndicatorSnapshot): string {
  const dirLabel = direction === "up" ? "上昇" : direction === "down" ? "下降" : "横ばい";
  const rsiText = ind.rsi14 !== null ? `RSI ${ind.rsi14.toFixed(1)}` : "RSI計算不可";
  return `${timeframe}足は${dirLabel}基調（${rsiText}）`;
}
