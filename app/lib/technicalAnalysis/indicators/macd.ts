import type { IndicatorReason } from "../types";
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

  // シグナル線は「MACDが計算できた区間」だけを対象にEMAを取り、元の長さに戻す
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

export function describeMACD(
  macd: number,
  signal: number,
  prevMacd: number,
  prevSignal: number,
  price: number
): IndicatorReason {
  const bullishCross = prevMacd <= prevSignal && macd > signal;
  const bearishCross = prevMacd >= prevSignal && macd < signal;

  if (bullishCross) {
    return {
      label: "MACD",
      value: "MACDがシグナルを上抜けしました（買いシグナル）",
      status: "positive",
    };
  }
  if (bearishCross) {
    return {
      label: "MACD",
      value: "MACDがシグナルを下抜けしました（売りシグナル）",
      status: "negative",
    };
  }

  // クロス直後でなくても、ヒストグラム（MACD-シグナル）が株価に対してごく僅かな場合は
  // モメンタムに乏しいとみなし中立とする（銘柄ごとの株価水準差を吸収するため％基準にする）
  const histogram = macd - signal;
  const neutralThreshold = price * 0.0005;
  if (Math.abs(histogram) <= neutralThreshold) {
    return {
      label: "MACD",
      value: "MACDとシグナルが拮抗しておりモメンタムに乏しい状態です",
      status: "neutral",
    };
  }

  if (macd > signal) {
    return {
      label: "MACD",
      value: "MACDがシグナルの上にあり上昇モメンタムです",
      status: "positive",
    };
  }
  return {
    label: "MACD",
    value: "MACDがシグナルの下にあり下落モメンタムです",
    status: "negative",
  };
}
