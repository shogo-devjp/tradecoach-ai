import { FX_TIMEFRAME_CONFIG } from "../config/timeframes";
import type { FxTimeframe, MultiTimeframeResult, TimeframeAnalysis } from "../types";

// 日足→大きな方向、4時間足→中期トレンド、1時間足→現在のトレンド、15分足→エントリー候補、
// 5分足→エントリータイミング、という考え方に基づき、上位足(higher)と下位足(lower)を
// それぞれ重み付き平均でまとめ、両者の合意度(agreement)を算出する。
// agreementが低い＝上位足と下位足が逆方向を向いている＝方向感が不明確、という判定に使う（scoring/decisionで利用）。
export function combineMultiTimeframe(
  byTimeframe: Partial<Record<FxTimeframe, TimeframeAnalysis>>
): MultiTimeframeResult {
  const complete: Record<FxTimeframe, TimeframeAnalysis> = byTimeframe as Record<FxTimeframe, TimeframeAnalysis>;

  const higherEntries = Object.values(complete).filter(
    (tf): tf is TimeframeAnalysis => tf !== undefined && FX_TIMEFRAME_CONFIG[tf.timeframe].group === "higher"
  );
  const lowerEntries = Object.values(complete).filter(
    (tf): tf is TimeframeAnalysis => tf !== undefined && FX_TIMEFRAME_CONFIG[tf.timeframe].group === "lower"
  );

  const weightedAverage = (entries: TimeframeAnalysis[]): number => {
    if (entries.length === 0) return 0;
    const totalWeight = entries.reduce((sum, tf) => sum + FX_TIMEFRAME_CONFIG[tf.timeframe].weight, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = entries.reduce(
      (sum, tf) => sum + tf.directionScore * FX_TIMEFRAME_CONFIG[tf.timeframe].weight,
      0
    );
    return weightedSum / totalWeight;
  };

  const higherTfBias = weightedAverage(higherEntries);
  const lowerTfBias = weightedAverage(lowerEntries);

  // agreement = 1のとき完全一致（同じ方向・同じ強さ）、0のとき正反対。
  // (2 - |higher - lower|) / 2 は |higher-lower| が0〜2の範囲を取ることを踏まえた正規化。
  const agreement = (2 - Math.abs(higherTfBias - lowerTfBias)) / 2;

  return { byTimeframe: complete, agreement, higherTfBias, lowerTfBias };
}
