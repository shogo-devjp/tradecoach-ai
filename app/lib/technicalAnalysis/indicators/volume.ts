import type { VolumeReason } from "../types";

export function analyzeVolume(volumes: number[], period = 20): VolumeReason {
  const recentVolumes = volumes.slice(-period);
  const latestVolume = volumes[volumes.length - 1];
  const avgVolume = recentVolumes.reduce((sum, v) => sum + v, 0) / recentVolumes.length;
  const ratio = avgVolume > 0 ? latestVolume / avgVolume : 1;

  if (ratio >= 1.5) {
    return {
      label: "出来高",
      value: `直近平均の${ratio.toFixed(1)}倍と急増しています（値動きへの注目度が高い）`,
      status: "positive",
      ratio,
    };
  }
  if (ratio <= 0.5) {
    return {
      label: "出来高",
      value: `直近平均の${ratio.toFixed(1)}倍と低調です（値動きの勢いが弱い可能性）`,
      status: "negative",
      ratio,
    };
  }
  return {
    label: "出来高",
    value: `直近平均並み（${ratio.toFixed(1)}倍）です`,
    status: "neutral",
    ratio,
  };
}
