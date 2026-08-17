import type { FxTimeframe } from "../types";

export interface TimeframeConfig {
  timeframe: FxTimeframe;
  // マルチタイムフレーム分析での重み（上位足ほど「大きな方向」として重い）。
  // 日足0.35 / 4時間足0.30 / 1時間足0.20 / 15分足0.10 / 5分足0.05
  // 「上位足＝方向性の判断材料、下位足＝エントリータイミングの判断材料」という
  // 一般的なトップダウン分析の考え方に基づく（分析/multiTimeframe.tsで使用）。
  weight: number;
  // 上位足(higher)グループか下位足(lower)グループか。合意度(agreement)の算出に使う。
  group: "higher" | "lower";
  // yahoo-finance2 に渡す interval。4hはYahoo非対応のため60mを取得してresample.tsで合成する。
  yahooInterval: "5m" | "15m" | "60m" | "1d";
  // 何日分のローソク足を取得するか（Yahoo Financeのintraday取得可能期間の制約に合わせる）
  lookbackDays: number;
  // 4hのように合成が必要な場合の元データの本数（60分足を何本まとめて1本にするか）
  resampleFactor?: number;
}

export const FX_TIMEFRAME_CONFIG: Record<FxTimeframe, TimeframeConfig> = {
  "1d": { timeframe: "1d", weight: 0.35, group: "higher", yahooInterval: "1d", lookbackDays: 730 },
  "4h": {
    timeframe: "4h",
    weight: 0.3,
    group: "higher",
    yahooInterval: "60m",
    lookbackDays: 59,
    resampleFactor: 4,
  },
  "1h": { timeframe: "1h", weight: 0.2, group: "lower", yahooInterval: "60m", lookbackDays: 59 },
  "15m": { timeframe: "15m", weight: 0.1, group: "lower", yahooInterval: "15m", lookbackDays: 59 },
  "5m": { timeframe: "5m", weight: 0.05, group: "lower", yahooInterval: "5m", lookbackDays: 59 },
};

// Multi Timeframe分析・UI表示で常に一定の順序（上位足→下位足）を保つため配列でも公開する
export const FX_TIMEFRAME_ORDER: FxTimeframe[] = ["1d", "4h", "1h", "15m", "5m"];
