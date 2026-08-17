import type { FxDecision, FxDirection, MarketRegimeState, VolatilityLevel } from "./types";

// FX版専用の表示ラベル。株式版 technicalAnalysis/displayLabels.ts とは独立させ、
// 将来どちらかの文言を変更しても互いに影響しないようにしている（値が同じでも意図的に複製）。
export const DECISION_LABEL: Record<FxDecision, string> = {
  BUY: "買い",
  SELL: "売り",
  WAIT: "待ち",
};

export const REGIME_LABEL: Record<MarketRegimeState, string> = {
  TREND_UP: "上昇トレンド",
  TREND_DOWN: "下降トレンド",
  RANGE: "レンジ",
  HIGH_VOLATILITY: "高ボラティリティ",
  LOW_VOLATILITY: "低ボラティリティ",
};

export const VOLATILITY_LABEL: Record<VolatilityLevel, string> = {
  high: "高い",
  normal: "普通",
  low: "低い",
};

export const DIRECTION_ARROW: Record<FxDirection, string> = {
  上昇: "↑",
  下降: "↓",
  横ばい: "→",
};

export const TIMEFRAME_LABEL: Record<string, string> = {
  "5m": "5分足",
  "15m": "15分足",
  "1h": "1時間足",
  "4h": "4時間足",
  "1d": "日足",
};

export const FX_DISCLAIMER_TEXT =
  "本情報は投資判断の参考情報であり、特定の売買を推奨または保証するものではありません。自動売買・実際の発注は行いません。";
