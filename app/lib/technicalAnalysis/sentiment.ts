import type { IndicatorReason, MarketSentiment } from "./types";

export interface SentimentResult {
  sentiment: MarketSentiment;
  reason: string;
}

function statusVote(status: IndicatorReason["status"]): number {
  if (status === "positive") return 1;
  if (status === "negative") return -1;
  return 0;
}

function rsiVote(rsiValue: number): number {
  if (rsiValue > 55) return 1;
  if (rsiValue < 45) return -1;
  return 0;
}

// トレンド・MACD・RSI(50基準)の3票の多数決で市場心理を判定する
export function determineSentiment(
  trendReason: IndicatorReason,
  macdReason: IndicatorReason,
  rsiValue: number
): SentimentResult {
  const total = statusVote(trendReason.status) + statusVote(macdReason.status) + rsiVote(rsiValue);

  if (total >= 1) {
    return {
      sentiment: "強気優勢",
      reason: "トレンド・MACD・RSIの多数が上向きで、買い手優勢の地合いです",
    };
  }
  if (total <= -1) {
    return {
      sentiment: "弱気優勢",
      reason: "トレンド・MACD・RSIの多数が下向きで、売り手優勢の地合いです",
    };
  }
  return {
    sentiment: "様子見",
    reason: "強気・弱気の材料が拮抗しており、方向感の乏しい地合いです",
  };
}
