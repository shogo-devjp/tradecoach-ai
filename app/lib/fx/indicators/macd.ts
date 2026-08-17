import { calculateEMA } from "./ema";

export interface MACDResult {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
}

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const macdLine = closes.map((_, i) => {
    const fast = emaFast[i];
    const slow = emaSlow[i];
    return fast !== null && slow !== null ? fast - slow : null;
  });

  const macdValues = macdLine.filter((v): v is number => v !== null);
  const signalRaw = calculateEMA(macdValues, signalPeriod);

  const signalLine: (number | null)[] = [];
  let si = 0;
  for (const v of macdLine) {
    if (v === null) {
      signalLine.push(null);
    } else {
      signalLine.push(signalRaw[si] ?? null);
      si++;
    }
  }

  const histogram = macdLine.map((v, i) => {
    const s = signalLine[i];
    return v !== null && s !== null ? v - s : null;
  });

  return { macdLine, signalLine, histogram };
}
