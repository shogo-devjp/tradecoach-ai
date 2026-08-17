import type { MultiTimeframeResult, Timeframe, TimeframeAnalysis, TimeframeDirection, TimeframeWeights } from "../types";

const DIRECTION_VALUE: Record<TimeframeAnalysis["direction"], number> = { up: 1, flat: 0, down: -1 };
const ARROW: Record<TimeframeAnalysis["direction"], TimeframeDirection["arrow"]> = { up: "↑", down: "↓", flat: "→" };

// 「日足→大きな方向、4時間足→中期トレンド、1時間足→現在のトレンド、
//  15分足→エントリー候補、5分足→エントリータイミング」という考え方（要件3）を、
// config化したウェイトで加重平均する形で実装する。
export function buildMultiTimeframeResult(
  perTimeframe: TimeframeAnalysis[],
  weights: TimeframeWeights
): MultiTimeframeResult {
  const directions: TimeframeDirection[] = perTimeframe.map((tf) => ({
    timeframe: tf.timeframe,
    direction: tf.direction,
    arrow: ARROW[tf.direction],
  }));

  let weightedSum = 0;
  let weightTotal = 0;
  for (const tf of perTimeframe) {
    const weight = weights[tf.timeframe];
    weightedSum += DIRECTION_VALUE[tf.direction] * weight;
    weightTotal += weight;
  }
  const alignmentScore = weightTotal > 0 ? weightedSum / weightTotal : 0;

  const higherTf = perTimeframe.filter((tf) => tf.timeframe === "1d" || tf.timeframe === "4h");
  const lowerTf = perTimeframe.filter((tf) => tf.timeframe === "15m" || tf.timeframe === "5m");
  const higherDirection = dominantDirection(higherTf);
  const lowerDirection = dominantDirection(lowerTf);

  // 上位足と下位足が明確に逆方向を向いている場合は「矛盾」としてWAIT判定の重要な材料にする（要件11）。
  const higherLowerConflict =
    higherDirection !== "flat" && lowerDirection !== "flat" && higherDirection !== lowerDirection;

  return { perTimeframe, directions, higherLowerConflict, alignmentScore };
}

function dominantDirection(list: TimeframeAnalysis[]): TimeframeAnalysis["direction"] {
  if (list.length === 0) return "flat";
  const total = list.reduce((sum, tf) => sum + DIRECTION_VALUE[tf.direction], 0);
  if (total > 0) return "up";
  if (total < 0) return "down";
  return "flat";
}

export function findTimeframe(perTimeframe: TimeframeAnalysis[], timeframe: Timeframe): TimeframeAnalysis | undefined {
  return perTimeframe.find((tf) => tf.timeframe === timeframe);
}
