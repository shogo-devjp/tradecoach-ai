import type { EntryBlockLevel, IndicatorRawValues, RiskLevel, Signal, TodayAction } from "../technicalAnalysis/types";

// ============================================================================
// Signal Snapshot（設計書§7の核。Paper Trading・225銘柄universeVerification共通の
// 「唯一の判断ソース」。8:30スキャン→本Snapshot固定→Paper Trading候補選抜／
// Verification全件記録、という単一の分岐元として両モジュールから参照される）
// ============================================================================
// 朝スクリーニングが正常完了したことを確認した直後（9:00 JSTより前）に、その時点の
// 全候補（getCachedScan()の生候補一覧）をそのままコピーして凍結保存する。
// 一度保存した当日分は上書きしない。意思決定・記録の根拠はこのSnapshotのみとし、
// verification/data/log.json（後から上書きされうる既存30銘柄方式）には一切依存しない。

export interface SignalSnapshot {
  id: string; // `${date}-${code}`
  date: string; // YYYY-MM-DD（判定日）
  analyzedAt: string; // ISO8601（朝スクリーニングの分析実行時刻＝getCachedScan().scannedAt）
  scanStartedAt: string; // ISO8601（scanUniverse()呼び出し開始時刻）
  snapshotCapturedAt: string; // ISO8601（完了確認後、実際に凍結保存した時刻）
  scanCompletedAt: string; // ISO8601（スキャン自体が完了した時刻。Phase1ではanalyzedAtと同値）
  universeSize: number; // 対象銘柄数（期待値）
  succeededCount: number; // 分析に成功した件数
  failedCount: number; // 分析に失敗した件数
  code: string;
  name: string;
  signal: Signal; // 買い/売り/待ち
  score: number;
  // 既存rankBuySignals()（app/lib/screening/rankings.ts）と同じ同点時tie-break条件に使うため保持する。
  confidence: number;
  todayAction: TodayAction;
  priceAtJudgment: number; // 判定時点の参照価格（前日終値ベース。約定には使わない）
  entryPriceCandidate: number; // priceLevels.entryPrice
  stopLoss: number;
  takeProfit: number;
  entryBlockLevel: EntryBlockLevel;
  riskLevel: RiskLevel;
  strategyVersion: string; // 例 "strategy-a-standard@1"（判定ロジックのバージョン）
  sourceScannedAt: string; // getCachedScan().scannedAt（元データの追跡用。analyzedAtと同値）
  // 判断の再現・後解析用（RSI/MACD/移動平均等の生値）。universeVerificationが主に利用する。
  indicatorValues: IndicatorRawValues;
}

// Snapshot捕捉1回（1日1回）の結果。捕捉できなかった日もfail-safeとして必ず1件残す。
export type SnapshotSkipReason =
  | "cache_unavailable" // getCachedScan()が当日分を返さなかった（サーバー再起動等）
  | "incomplete_scan" // 対象銘柄数に対して結果件数が不足している
  | "too_many_failures" // 失敗件数が許容閾値を超えている
  | "after_market_open" // 9:00 JSTを過ぎてしまった
  | "not_a_trading_day"; // 土日・年末年始・祝日等の非営業日（morningOrchestration.tsのAPI側ガード）

export interface SnapshotCaptureResult {
  date: string;
  captured: boolean; // falseの場合はfail-safe（新規BUYなし）
  reason?: SnapshotSkipReason;
  capturedAt: string | null;
  universeSize?: number;
  succeededCount?: number;
  failedCount?: number;
  scanCompletedAt?: string;
}

// ============================================================================
// ポジション・取引
// ============================================================================

export type ExitReason = "sell_signal" | "stop_loss" | "take_profit" | "max_holding_period";

export interface EntryExecution {
  judgmentAt: string; // Signal Snapshotのanalyzedat（判定時刻）
  plannedFillAt: string; // 概念上の約定時刻（判定日9:00 JST）
  processedAt: string; // 実際にバッチが処理した時刻
  dayOpen: number;
  entrySlippageBps: number;
  commission: number;
  fillPrice: number; // Open × (1 + slippage)
  gapAdjusted: false; // Entryは常にOpen基準のため常にfalse（Gapは無効化判定側で扱う）
  invalidatedByGap: boolean; // Openが約定前提のSLを既に割り込んでいたため見送ったか
}

export interface ExitExecution {
  reason: ExitReason;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  dayClose: number;
  referencePrice: number; // SL/TP/Openのうちどれを基準にしたか
  exitSlippageBps: number;
  commission: number;
  fillPrice: number;
  gapAdjusted: boolean;
  sameDayConflict: boolean; // 同日SL/TP競合（保守ルール適用）だったか
  processedAt: string;
}

export interface PaperPosition {
  id: string; // `${strategyId}-${code}-${date}`
  strategyId: string;
  code: string;
  name: string;
  snapshotId: string; // 追跡可能性: どのSignal Snapshotに基づくか
  buyJudgedAt: string; // Snapshot.analyzedAt
  buySignalScore: number;
  buyReasons: string[]; // todayActionReason等、Snapshotから転記
  strategyVersion: string;

  shares: number; // 100株単位
  status: "open" | "closed";

  entry: EntryExecution;
  stopLoss: number;
  takeProfit: number;

  exit?: ExitExecution;

  investedAmount: number;
  currentPrice?: number;
  unrealizedPnl?: number;
  unrealizedPnlPercent?: number;
  holdingDays?: number;
}

export interface PaperTrade {
  id: string;
  strategyId: string;
  code: string;
  name: string;
  shares: number;
  entryFillPrice: number;
  exitFillPrice: number;
  entryAt: string;
  exitAt: string;
  holdingDays: number;
  exitReason: ExitReason;
  realizedPnl: number;
  realizedPnlPercent: number;
  commissionTotal: number;
}

export interface ExecutionLogEntry {
  id: string;
  positionId: string;
  strategyId: string;
  code: string;
  snapshotId: string | null;
  side: "ENTRY" | "EXIT";
  reason: "buy_signal" | ExitReason;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  dayClose: number;
  referencePrice: number;
  slippageBps: number;
  commission: number;
  fillPrice: number;
  gapAdjusted: boolean;
  sameDayConflict: boolean;
  judgmentAt: string;
  plannedFillAt: string;
  processedAt: string;
}

// ============================================================================
// Portfolio
// ============================================================================

export interface PaperPortfolioState {
  strategyId: string;
  cash: number;
  cumulativeRealizedPnl: number;
  peakTotalAssets: number; // 最大ドローダウン算出用
  lastRunDate: string | null; // 冪等性チェック用（同日の二重run防止）
  lastSnapshotDate: string | null;
}

export interface PaperPortfolioSnapshot {
  strategyId: string;
  date: string;
  cash: number;
  positionsValue: number;
  totalAssets: number;
  unrealizedPnl: number;
  realizedPnlToday: number;
  cumulativeRealizedPnl: number;
  cumulativeReturnPercent: number;
  benchmarkValue: number;
  benchmarkReturnPercent: number;
  drawdownPercent: number;
  openPositionCount: number;
  newBuyHalted: boolean; // 日次最大損失/最大DD到達等でその日の新規BUYを止めたか
  haltReason?: string;
}

// ============================================================================
// 設定
// ============================================================================

export interface StrategyConfig {
  strategyId: string;
  initialCapital: number;
  lotSize: number; // 100固定（Phase1）。将来の単元未満株対応のため設定化
  maxPositions: number; // 3
  riskPercent: number; // 0.02
  entrySlippageBps: number; // 10
  exitSlippageBps: number; // 10
  commissionPerTrade: number; // 0
  maxHoldingDays: number; // 20
  dailyLossLimitPercent: number; // 0.03
  maxDrawdownHaltPercent: number; // 0.15
  abnormalPriceChangePercent: number; // 0.25
  benchmarkSymbol: string; // "^N225"
}

export interface PaperTradingConfig {
  strategies: Record<string, StrategyConfig>;
}

// ============================================================================
// Strategy interface（§11・§12）
// ============================================================================

export interface StrategyDecisionContext {
  snapshotRows: SignalSnapshot[]; // 当日Snapshotの全銘柄分
  openPositions: PaperPosition[]; // このstrategyIdの保有分のみ
}

export interface BuyCandidate {
  code: string;
  name: string;
  snapshotId: string;
  score: number;
  confidence: number;
  reasons: string[];
  stopLoss: number;
  takeProfit: number;
  entryPriceCandidate: number;
  judgmentAt: string;
}

export interface StrategyDecision {
  buyCandidates: BuyCandidate[]; // スコア降順。riskManagerが上から順に採用可否を判定する
  sellCodes: string[]; // 保有銘柄のうちSELL判定が出たコード
}

export interface PaperStrategy {
  id: string;
  version: string;
  decide(context: StrategyDecisionContext): StrategyDecision;
}
