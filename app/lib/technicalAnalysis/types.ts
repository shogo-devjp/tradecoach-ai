export type Signal = "買い" | "売り" | "待ち";
export type TrendDirection = "上昇" | "下降" | "横ばい";
export type IndicatorStatus = "positive" | "negative" | "neutral";
export type MarketSentiment = "強気優勢" | "弱気優勢" | "様子見";
export type RiskLevel = "低" | "中" | "高";
export type StrategyAction = "買い場" | "待機" | "利確優先";

export interface IndicatorReason {
  label: string;
  value: string;
  status: IndicatorStatus;
}

export interface SupportResistanceReason extends IndicatorReason {
  support: number;
  resistance: number;
}

export interface VolumeReason extends IndicatorReason {
  ratio: number;
}

export type EntryBlockLevel = "none" | "caution" | "blocked";

export interface EntryBlock {
  level: EntryBlockLevel;
  reason: string | null;
}

export interface ScoreBreakdownItem {
  label: string;
  points: number;
  status: IndicatorStatus;
  contributesToScore: boolean;
}

export type MarketCondition = "強い" | "弱い" | "中立";

export interface IndexCondition {
  price: number;
  changePercent: number;
  trend: TrendDirection;
  condition: MarketCondition;
}

export interface MarketRegime {
  nikkei225: IndexCondition;
  topix: IndexCondition;
  overall: MarketCondition;
  comment: string;
}

export type EntryTiming = "今すぐエントリー" | "押し目待ち" | "ブレイク待ち" | "様子見" | "本日は休みましょう";

// 「今日やること」表示用。EntryTimingに加えてEntryBlockが"blocked"の場合の「見送り」を含む5段階。
export type TodayAction = EntryTiming | "見送り";

export interface PriceLevels {
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
}

export interface OHLCVSeries {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
}

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
}

// verificationログ完全化（Version 1.2）用。analyze.ts内で既に計算済みだった生値を
// 外部から参照できるようにするための型。スコア計算式・シグナル判定には使わない（表示・記録専用）。
export interface IndicatorRawValues {
  rsi: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  sma5: number;
  sma25: number;
  sma75: number;
  // 現在値が各移動平均線から何%乖離しているか（正=上回っている、負=下回っている）
  ma5DiffPercent: number;
  ma25DiffPercent: number;
  ma75DiffPercent: number;
}

export interface TodayStrategy {
  action: StrategyAction;
  headline: string;
  description: string;
}

export interface AnalysisResult {
  score: number;
  signal: Signal;
  confidence: number;
  trend: TrendDirection;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  aiComment: string;
  reasons: string[];
  sentiment: MarketSentiment;
  risk: RiskAssessment;
  entryPriority: number;
  strategy: TodayStrategy;
  coachComment: string;
  atrValue: number;
  atrPercent: number;
  riskReward: number;
  entryBlock: EntryBlock;
  scoreBreakdown: ScoreBreakdownItem[];
  marketRegime: MarketRegime;
  entryTiming: EntryTiming;
  entryTimingScore: number;
  todayAction: TodayAction;
  todayActionReason: string;
  indicatorValues: IndicatorRawValues;
  // includeIntraday:false（一括スクリーニング）の場合は常にnull（そもそも未取得のため）。
  trend60m: TrendDirection | null;
  trend15m: TrendDirection | null;
  indicators: {
    movingAverage5: IndicatorReason;
    movingAverage25: IndicatorReason;
    movingAverage75: IndicatorReason;
    macd: IndicatorReason;
    rsi: IndicatorReason;
    volume: VolumeReason;
    supportResistance: SupportResistanceReason;
    trend: IndicatorReason;
    dowTheory: IndicatorReason;
    atr: IndicatorReason;
  };
}
