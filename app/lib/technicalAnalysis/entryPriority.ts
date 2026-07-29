import type { RiskLevel } from "./types";

// スコアの50点(中立)からの乖離度と信頼度を合成し、リスクが高い場合は1段階減点する
export function calculateEntryPriority(score: number, confidence: number, riskLevel: RiskLevel): number {
  const conviction = Math.abs(score - 50) / 50;
  const confidenceFactor = confidence / 100;
  const combined = conviction * 0.6 + confidenceFactor * 0.4;

  let stars = Math.round(combined * 5);
  if (riskLevel === "高") stars -= 1;

  return Math.min(5, Math.max(1, stars));
}
