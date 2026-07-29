import type { IndicatorReason } from "../types";

export function calculateRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // Wilderの平滑化法で以降のRSIを逐次更新
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

export function describeRSI(rsi: number): IndicatorReason {
  if (rsi >= 70) {
    return {
      label: "RSI",
      value: `RSIは${rsi.toFixed(1)}で買われすぎ水準です`,
      status: "negative",
    };
  }
  if (rsi <= 30) {
    return {
      label: "RSI",
      value: `RSIは${rsi.toFixed(1)}で売られすぎ水準です`,
      status: "positive",
    };
  }
  return {
    label: "RSI",
    value: `RSIは${rsi.toFixed(1)}で中立圏です`,
    status: "neutral",
  };
}
