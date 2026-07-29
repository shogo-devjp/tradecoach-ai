import type { RiskAssessment, RiskLevel } from "./types";

const LEVELS: RiskLevel[] = ["低", "中", "高"];

function escalate(level: RiskLevel): RiskLevel {
  const index = LEVELS.indexOf(level);
  return LEVELS[Math.min(index + 1, LEVELS.length - 1)];
}

// ATR(価格に対する%)を基準にボラティリティのリスクを判定し、
// RSIの過熱・売られすぎや信頼度の低さがあれば一段階引き上げる
export function assessRisk(
  atr: number,
  currentPrice: number,
  rsiValue: number,
  confidence: number
): RiskAssessment {
  const volatilityPercent = (atr / currentPrice) * 100;

  let level: RiskLevel = "低";
  if (volatilityPercent >= 4) level = "高";
  else if (volatilityPercent >= 2) level = "中";

  const reasons: string[] = [`直近の値動き幅(ATR)は現在値の${volatilityPercent.toFixed(1)}%`];

  if (rsiValue >= 75 || rsiValue <= 25) {
    level = escalate(level);
    reasons.push("RSIが極端な水準で反転リスクあり");
  }

  if (confidence < 40) {
    level = escalate(level);
    reasons.push("指標間の一致度が低く判断の確度が低い");
  }

  return { level, reason: reasons.join("。") + "。" };
}
