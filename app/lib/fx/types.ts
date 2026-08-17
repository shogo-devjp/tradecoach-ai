// FX版TradeCoach AIの型定義。株式版 app/lib/technicalAnalysis/types.ts とは意図的に分離する
// （売買判定ロジック・スコアリングは通貨と株式で前提が異なるため統合しない）。

export type Timeframe = "5m" | "15m" | "1h" | "4h" | "1d";

export const TIMEFRAMES: Timeframe[] = ["5m", "15m", "1h", "4h", "1d"];

// 通貨ペアをコードにベタ書きしないための定義。新しいペアは pairs.ts に追加するだけでよい。
export interface CurrencyPairConfig {
  id: string; // 例: "USDJPY"
  base: string; // 例: "USD"
  quoteCurrency: string; // 例: "JPY"（quoteは予約語的に紛らわしいのでquoteCurrencyとする）
  yahooSymbol: string; // 例: "USDJPY=X"
  displayName: string; // 例: "USD/JPY"
  // 1pipに相当する価格幅。JPYクロスは0.01、それ以外は0.0001が一般的。
  pipSize: number;
  // 表示用の小数点以下桁数
  priceDecimals: number;
}

export interface OHLCBar {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  // Yahoo Financeの為替データは出来高が常に0（インターバンクFXに「出来高」という概念が
  // そのまま存在しないため）。tick volumeが取得できるデータソースに切り替えた場合のための
  // 拡張フィールドとして残すが、Phase 1のスコアリングでは一切使わない。
  tickVolume?: number;
}

export type OHLCSeries = OHLCBar[];

export interface OHLCSeriesArrays {
  times: number[];
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
}

export type FxSignal = "買い" | "売り" | "待ち";
export type FxDirection = "up" | "down" | "flat";

// 各時間足の方向性（UI上で 5m↑ 15m↑ 1h↑ 4h↑ 1d→ のように表示する）
export interface TimeframeDirection {
  timeframe: Timeframe;
  direction: FxDirection;
  arrow: "↑" | "↓" | "→";
}

export type TrendState = "TREND_UP" | "TREND_DOWN" | "RANGE";
export type VolatilityState = "HIGH_VOLATILITY" | "NORMAL_VOLATILITY" | "LOW_VOLATILITY";

// 相場環境。トレンド軸とボラティリティ軸は独立させる
// （「上昇トレンドかつ高ボラティリティ」のように両方が同時に成立しうるため、単一のenumにはしない）。
export interface MarketRegime {
  trend: TrendState;
  volatility: VolatilityState;
  label: string; // 日本語の複合ラベル（例:「上昇トレンド・通常ボラティリティ」）
  adx: number;
  atrPercent: number; // 4hのATRを現在値で正規化した%（ボラティリティ判定の主指標）
}

export type SessionName = "TOKYO" | "LONDON" | "NEWYORK" | "OFF_HOURS";

export interface SessionInfo {
  // 現在アクティブな市場（重複時は複数）
  activeSessions: SessionName[];
  // 表示用ラベル（例:「東京時間」「ロンドン・NY重複」）
  label: string;
  // 重複セッションかどうか（ボラティリティが上がりやすい時間帯として利用）
  isOverlap: boolean;
  utcHour: number;
  isDstAdjusted: boolean;
}

export interface IndicatorSnapshot {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  sma20: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  atr14: number | null;
  atrPercent: number | null;
  bollingerUpper: number | null;
  bollingerLower: number | null;
  bollingerMiddle: number | null;
  bollingerWidthPercent: number | null;
  adx14: number | null;
  support: number | null;
  resistance: number | null;
  recentHigh: number | null;
  recentLow: number | null;
}

export type IndicatorStatus = "positive" | "negative" | "neutral";

export interface TimeframeAnalysis {
  timeframe: Timeframe;
  currentPrice: number;
  indicators: IndicatorSnapshot;
  direction: FxDirection;
  trendStatus: IndicatorStatus;
  momentumStatus: IndicatorStatus;
  // このタイムフレームだけを見たときの一言コメント（内訳表示・デバッグ用）
  note: string;
}

// マルチタイムフレーム分析の各足のウェイト。config.tsでconfig化し、後から変更可能にする。
export interface TimeframeWeights {
  "5m": number;
  "15m": number;
  "1h": number;
  "4h": number;
  "1d": number;
}

export interface MultiTimeframeResult {
  perTimeframe: TimeframeAnalysis[];
  directions: TimeframeDirection[];
  // 上位足(1d/4h)と下位足(15m/5m)が逆方向かどうか。WAIT判定の重要な入力になる。
  higherLowerConflict: boolean;
  // -1(全て下降)〜+1(全て上昇)のマルチタイムフレーム総合スコア
  alignmentScore: number;
}

// 各スコア構成要素のウェイト。config化して後から変更可能にする（要件8）。
export interface ScoreWeights {
  higherTimeframeTrend: number;
  lowerTimeframeTrend: number;
  momentum: number;
  supportResistance: number;
  volatility: number;
  marketRegime: number;
  session: number;
}

export interface ScoreComponent {
  label: string;
  weight: number;
  // -1(強い売り材料)〜+1(強い買い材料)に正規化した値
  value: number;
  // weight * value（BUY/SELLどちらの方向に何点寄与したか）
  contribution: number;
  note: string;
}

export interface FxScoreResult {
  buyScore: number; // 0〜100
  sellScore: number; // 0〜100
  components: ScoreComponent[];
}

export interface FxPriceLevels {
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
}

export interface RiskRewardResult {
  ratio: number; // takeProfit1基準のR:R
  isAcceptable: boolean; // config.minRiskReward未満ならfalse
}

export type WaitReasonCode =
  | "TREND_UNCLEAR"
  | "HIGHER_LOWER_CONFLICT"
  | "EXTREME_VOLATILITY"
  | "STOP_TOO_FAR"
  | "POOR_RISK_REWARD"
  | "MID_RANGE_SR"
  | "INDICATOR_CONFLICT"
  | "ECONOMIC_EVENT_RISK";

export interface FxDecision {
  signal: FxSignal;
  confidence: number; // 0〜100
  reasons: string[]; // 「なぜその判定なのか」の箇条書き
  waitReasonCodes: WaitReasonCode[];
}

// Phase 1では実装しないが、将来の重要指標対応（CPI/雇用統計/FOMC/日銀会合など）のための
// 拡張ポイント。analyzeFxPairはこの値を受け取れるが、Phase 1では常にrisk:false固定で
// スコア・判定には影響させない。
export interface EconomicEventRisk {
  isNearHighImpactEvent: boolean;
  eventName: string | null;
  minutesUntilEvent: number | null;
}

export interface FxAnalysisResult {
  pair: CurrencyPairConfig;
  price: number;
  timestamp: number; // 分析対象データの基準時刻（epoch ms）。バックテスト時は過去日時になる。
  marketRegime: MarketRegime;
  session: SessionInfo;
  multiTimeframe: MultiTimeframeResult;
  score: FxScoreResult;
  decision: FxDecision;
  priceLevels: FxPriceLevels;
  riskReward: RiskRewardResult;
  aiComment: string;
  economicEventRisk: EconomicEventRisk;
}

// 各時間足のOHLCデータをまとめたもの。analyzeFxPairへの唯一の必須入力。
// 現在時刻やリアルタイムAPIに一切依存しないため、過去データを渡せばバックテストにも使える（要件19）。
export type FxMultiTimeframeData = Record<Timeframe, OHLCSeries>;

export interface AnalyzeFxPairOptions {
  now?: number; // 分析基準時刻（epoch ms）。省略時はDate.now()。バックテストでは過去時刻を渡す。
  economicEventRisk?: EconomicEventRisk;
}
