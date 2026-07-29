import type { IndicatorReason } from "../types";

export function calculateSMA(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((sum, v) => sum + v, 0) / period;
  });
}

// 現在値と個別の移動平均線を比較して、その移動平均線単体での買い/中立/売りを判定する。
// ±1%以内は方向感に乏しいとみなし中立とする。
const NEUTRAL_BAND_PERCENT = 1;

export function describeSingleMA(periodLabel: string, price: number, maValue: number): IndicatorReason {
  const diffPercent = ((price - maValue) / maValue) * 100;
  const label = `${periodLabel}移動平均線`;

  if (diffPercent > NEUTRAL_BAND_PERCENT) {
    return {
      label,
      value: `現在値が${periodLabel}線を${diffPercent.toFixed(1)}%上回っています（強含み）`,
      status: "positive",
    };
  }
  if (diffPercent < -NEUTRAL_BAND_PERCENT) {
    return {
      label,
      value: `現在値が${periodLabel}線を${Math.abs(diffPercent).toFixed(1)}%下回っています（弱含み）`,
      status: "negative",
    };
  }
  return {
    label,
    value: `現在値が${periodLabel}線付近（${diffPercent >= 0 ? "+" : ""}${diffPercent.toFixed(1)}%）で方向感に乏しい状態です`,
    status: "neutral",
  };
}
