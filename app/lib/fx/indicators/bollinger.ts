import { calculateSMA } from "./sma";

export interface BollingerBands {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  // バンド幅（%）＝ (upper-lower) / middle * 100。ボラティリティの拡大・収縮の目安として使う。
  widthPercent: (number | null)[];
}

export function calculateBollingerBands(closes: number[], period = 20, stdDevMultiplier = 2): BollingerBands {
  const middle = calculateSMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  const widthPercent: (number | null)[] = [];

  closes.forEach((_, i) => {
    const mid = middle[i];
    if (mid === null || i < period - 1) {
      upper.push(null);
      lower.push(null);
      widthPercent.push(null);
      return;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const variance = slice.reduce((sum, v) => sum + (v - mid) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);
    const u = mid + stdDev * stdDevMultiplier;
    const l = mid - stdDev * stdDevMultiplier;
    upper.push(u);
    lower.push(l);
    widthPercent.push(((u - l) / mid) * 100);
  });

  return { upper, middle, lower, widthPercent };
}
