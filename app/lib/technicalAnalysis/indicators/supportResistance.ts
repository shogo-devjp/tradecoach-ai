import type { SupportResistanceReason } from "../types";

export interface SupportResistanceResult {
  support: number;
  resistance: number;
  reason: SupportResistanceReason;
}

export function findSupportResistance(
  highs: number[],
  lows: number[],
  currentPrice: number,
  lookback = 60
): SupportResistanceResult {
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);

  const resistance = Math.max(...recentHighs);
  const support = Math.min(...recentLows);

  const distanceToResistance = ((resistance - currentPrice) / currentPrice) * 100;
  const distanceToSupport = ((currentPrice - support) / currentPrice) * 100;

  let status: SupportResistanceReason["status"] = "neutral";
  let value: string;

  if (distanceToResistance < 2) {
    status = "negative";
    value = `直近${lookback}日のレジスタンス ${resistance.toFixed(0)}円が目前です（上値が重い可能性）`;
  } else if (distanceToSupport < 2) {
    status = "positive";
    value = `直近${lookback}日のサポート ${support.toFixed(0)}円付近まで下落しています（反発の可能性）`;
  } else {
    value = `サポート ${support.toFixed(0)}円 〜 レジスタンス ${resistance.toFixed(0)}円のレンジ内です`;
  }

  return {
    support,
    resistance,
    reason: { label: "サポート・レジスタンス", value, status, support, resistance },
  };
}
