// ATR（Average True Range）。Wilderの平滑化法で算出。
export function calculateATR(highs: number[], lows: number[], closes: number[], period = 14): (number | null)[] {
  const trueRanges = highs.map((high, i) => {
    if (i === 0) return high - lows[i];
    const prevClose = closes[i - 1];
    return Math.max(high - lows[i], Math.abs(high - prevClose), Math.abs(lows[i] - prevClose));
  });

  const result: (number | null)[] = new Array(trueRanges.length).fill(null);
  if (trueRanges.length < period) return result;

  let atr = trueRanges.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  result[period - 1] = atr;

  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result[i] = atr;
  }

  return result;
}
