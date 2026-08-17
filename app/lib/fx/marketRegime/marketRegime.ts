import type { MarketRegime, TimeframeAnalysis, TrendState, VolatilityState } from "../types";
import { FX_CONFIG } from "../config";

// 相場環境判定は「中期トレンド」の役割を持つ4時間足を基準にする（要件3のマルチタイムフレームの
// 考え方に沿う）。ADXでトレンドの強さ、EMAの並びで方向を見て TREND_UP / TREND_DOWN / RANGE を判定し、
// 別軸としてATR%からボラティリティ状態を判定する（要件5）。
export function determineMarketRegime(fourHour: TimeframeAnalysis | null): MarketRegime {
  const config = FX_CONFIG.regime;

  if (!fourHour) {
    return {
      trend: "RANGE",
      volatility: "NORMAL_VOLATILITY",
      label: "判定不可（データ不足）・通常ボラティリティ",
      adx: 0,
      atrPercent: 0,
    };
  }

  const adx = fourHour.indicators.adx14 ?? 0;
  const atrPercent = fourHour.indicators.atrPercent ?? 0;

  const trend = determineTrendState(fourHour, adx, config.adxTrendThreshold);
  const volatility = determineVolatilityState(atrPercent, config.highVolatilityAtrPercent, config.lowVolatilityAtrPercent);

  return {
    trend,
    volatility,
    label: `${trendLabel(trend)}・${volatilityLabel(volatility)}`,
    adx,
    atrPercent,
  };
}

function determineTrendState(fourHour: TimeframeAnalysis, adx: number, adxThreshold: number): TrendState {
  if (adx < adxThreshold) return "RANGE";
  if (fourHour.direction === "up") return "TREND_UP";
  if (fourHour.direction === "down") return "TREND_DOWN";
  return "RANGE";
}

function determineVolatilityState(atrPercent: number, highThreshold: number, lowThreshold: number): VolatilityState {
  if (atrPercent >= highThreshold) return "HIGH_VOLATILITY";
  if (atrPercent <= lowThreshold) return "LOW_VOLATILITY";
  return "NORMAL_VOLATILITY";
}

function trendLabel(trend: TrendState): string {
  switch (trend) {
    case "TREND_UP":
      return "上昇トレンド";
    case "TREND_DOWN":
      return "下降トレンド";
    case "RANGE":
      return "レンジ相場";
  }
}

function volatilityLabel(volatility: VolatilityState): string {
  switch (volatility) {
    case "HIGH_VOLATILITY":
      return "高ボラティリティ";
    case "LOW_VOLATILITY":
      return "低ボラティリティ";
    case "NORMAL_VOLATILITY":
      return "通常ボラティリティ";
  }
}
