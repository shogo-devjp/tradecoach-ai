// FX版専用の型定義。株式版 app/lib/technicalAnalysis/types.ts とは意図的に独立させている
// （売買判定ロジック・スコアリングを株式と混ぜないという方針のため。文言が似ていても再利用しない）。

export type FxPairCode = "USDJPY" | "EURJPY" | "GBPJPY" | "AUDJPY" | "EURUSD" | "GBPUSD";

export type FxTimeframe = "5m" | "15m" | "1h" | "4h" | "1d";

export type FxDirection = "上昇" | "下降" | "横ばい";

// 内部状態としてのMarket Regime（要件どおり英語の状態名で管理し、UI表示だけ日本語ラベルに変換する）
export type MarketRegimeState =
  | "TREND_UP"
  | "TREND_DOWN"
  | "RANGE"
  | "HIGH_VOLATILITY"
  | "LOW_VOLATILITY";

export type VolatilityLevel = "high" | "normal" | "low";

export type FxSessionName = "TOKYO" | "LONDON" | "NEW_YORK";

export interface FxSessionState {
  activeSessions: FxSessionName[];
  // 東京-ロンドン、ロンドン-NYの重複時間帯（どちらにも該当しなければnull）
  overlap: "TOKYO_LONDON" | "LONDON_NEW_YORK" | null;
  comment: string;
}

export type FxDecision = "BUY" | "SELL" | "WAIT";
// 日本語UI表示用（内部ロジックはBUY/SELL/WAITの英語リテラルのまま扱う）
export type FxDecisionLabel = "買い" | "売り" | "待ち";

export interface FxOHLCSeries {
  // 各配列は時系列順（古い→新しい）で長さが揃っている前提
  times: number[]; // UNIX seconds
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  // FXのtick volumeは実売買高ではなく「価格更新回数」の目安でしかないため、
  // 取得できない/信頼できない場合はnullを許容する（株式の出来高ロジックはそのまま使わない）。
  tickVolumes: (number | null)[];
}

export interface FxIndicatorReason {
  label: string;
  value: string;
  status: "positive" | "negative" | "neutral";
}

export interface TimeframeIndicators {
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  atrPercent: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  bbMiddle: number | null;
  bbWidthPercent: number | null;
  adx14: number | null;
  support: number | null;
  resistance: number | null;
  momentum: number | null; // 直近N本の変化率(%)。値動きの勢いの目安
}

export interface TimeframeAnalysis {
  timeframe: FxTimeframe;
  direction: FxDirection;
  directionScore: number; // -1(下降)〜+1(上昇)
  indicators: TimeframeIndicators;
  reasons: FxIndicatorReason[];
  candleClose: number;
}

export interface MultiTimeframeResult {
  byTimeframe: Record<FxTimeframe, TimeframeAnalysis>;
  // 上位足(1d/4h)と下位足(1h/15m/5m)の合意度。1=完全一致、0=真逆
  agreement: number;
  higherTfBias: number; // -1〜+1
  lowerTfBias: number; // -1〜+1
}

export interface MarketRegimeResult {
  state: MarketRegimeState;
  volatilityLevel: VolatilityLevel;
  adx: number | null;
  atrPercent: number | null;
  bbWidthPercent: number | null;
  comment: string;
}

export interface FxScoreBreakdownItem {
  label: string;
  contribution: number; // -1〜+1（この要素が最終スコアに与えた向き・大きさ）
  weight: number;
  detail: string;
}

export interface FxScoreResult {
  buyScore: number; // 0〜100
  sellScore: number; // 0〜100（100-buyScoreの補数として算出。ロジックはscore.ts参照）
  conviction: number; // -1〜+1（正規化前の合成方向性）
  agreement: number;
  breakdown: FxScoreBreakdownItem[];
}

export interface FxPriceLevels {
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
}

export interface FxRiskReward {
  ratio: number; // takeProfit1基準
  riskPips: number;
  rewardPips: number;
}

// Phase 1では常に「リスクなし」を返す拡張ポイント（要件12）。
export interface EconomicEventRisk {
  hasUpcomingHighImpactEvent: boolean;
  minutesUntilEvent: number | null;
  eventName: string | null;
  recommendation: "normal" | "avoid_new_entries";
}

export interface FxDecisionResult {
  decision: FxDecision;
  confidence: number; // 0〜100
  reasons: string[];
  // WAITを強制した理由（該当なしならnull）。要件11「今は入らない方がいい」の根拠を明示するため。
  waitOverrideReason: string | null;
}

export interface FxAnalysisResult {
  pair: FxPairCode;
  currentPrice: number;
  regime: MarketRegimeResult;
  session: FxSessionState;
  multiTimeframe: MultiTimeframeResult;
  score: FxScoreResult;
  decision: FxDecisionResult;
  priceLevels: FxPriceLevels;
  riskReward: FxRiskReward;
  economicEventRisk: EconomicEventRisk;
  coachComment: string;
  reasons: string[];
}
