import type { IndicatorReason, TrendDirection } from "./types";

export interface TrendResult {
  trend: TrendDirection;
  reason: IndicatorReason;
}

export function determineTrend(currentPrice: number, sma25: number, sma75: number): TrendResult {
  if (currentPrice > sma25 && sma25 > sma75) {
    return {
      trend: "上昇",
      reason: {
        label: "トレンド",
        value: "現在値 > 25日線 > 75日線の並びで上昇トレンドです",
        status: "positive",
      },
    };
  }
  if (currentPrice < sma25 && sma25 < sma75) {
    return {
      trend: "下降",
      reason: {
        label: "トレンド",
        value: "現在値 < 25日線 < 75日線の並びで下降トレンドです",
        status: "negative",
      },
    };
  }
  return {
    trend: "横ばい",
    reason: {
      label: "トレンド",
      value: "移動平均線が交錯しており方向感の乏しい展開です",
      status: "neutral",
    },
  };
}
