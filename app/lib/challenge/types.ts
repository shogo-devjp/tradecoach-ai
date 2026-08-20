import type { Signal } from "@/app/lib/technicalAnalysis/types";
import type { ExitReason } from "@/app/lib/paperTrading/types";

// ============================================================================
// YouTube記録基盤（「AI資産運用50万円チャレンジ」）
// ============================================================================
// 本モジュールはPaper Trading・Universe Verificationの「読み取り・記録レイヤー」であり、
// 金額・損益・勝敗等の数値計算は一切行わない。すべてPaper Trading本体
// （app/lib/paperTrading、PaperPortfolioSnapshot・PaperTrade・PerformanceMetrics）を
// Single Source of Truthとしてそのまま転記する。本モジュールの失敗がPaper Trading本体・
// 225銘柄Verification・既存30銘柄Verificationの処理を止めたり書き換えたりすることはない。

// ============================================================================
// 1. Challenge基本情報
// ============================================================================

export type ChallengeStatus = "preparing" | "active" | "completed";

export interface ChallengeMeta {
  challengeId: string; // 例 "ai-500k-challenge-strategy-a-standard-paper"
  challengeName: string; // "AI資産運用50万円チャレンジ"
  initialCapital: number; // 500000
  // 本稼働（Paper Trading実運用）開始日。準備段階ではnull。
  // activateChallenge()呼び出し時に一度だけ確定し、以後は上書きしない。
  startedAt: string | null;
  strategyId: string;
  strategyVersion: string; // 開始時点のstrategyVersion（strategyHistoryの最初のエントリと一致）
  universe: "nikkei225";
  benchmarkSymbol: string; // "^N225"
  // 現状は株価のみのリターン。将来Phase 2で配当込みTotal Returnへ切り替え可能なように
  // バージョニングしておく（§9）。
  benchmarkMethod: "price_return";
  benchmarkVersion: 1;
  // 将来の実資金版と混同しないための明示フラグ。実資金版は別challengeId・別データとして扱う。
  paperTrading: true;
  status: ChallengeStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 2. 毎営業日のDaily Record
// ============================================================================

export interface ChallengeDailyTradeEntry {
  positionId: string;
  tradeId: string | null; // EXITの場合のみ存在（PaperTrade.id）
  code: string;
  companyName: string;
  side: "ENTRY" | "EXIT";
  signal: Signal | null; // 判断時点のSnapshotのsignal（買い）。参考情報のみ。
  score: number | null;
  confidence: number | null;
  entryPrice: number;
  exitPrice: number | null;
  shares: number;
  stopLoss: number;
  takeProfit: number;
  realizedPnl: number | null; // EXITの場合のみ（PaperTrade.realizedPnlをそのまま転記）
  returnPercent: number | null; // PaperTrade.realizedPnlPercentをそのまま転記
  exitReason: ExitReason | null;
  holdingDays: number | null;
  snapshotId: string;
  strategyVersion: string;
}

// 「なぜ選んだか／なぜ選ばなかったか」を後から復元するための選定記録（§3）。
// 当日のBUYシグナル銘柄のみを対象とする（SELL/WAITはPaper Trading選定の対象外のため）。
// scoreやindicatorValues等は現在のロジックで再分析せず、当日固定されたSignal Snapshotの
// 値をそのまま転記する。
export interface ChallengeSelectionRecord {
  code: string;
  companyName: string;
  signal: Signal;
  score: number;
  confidence: number;
  entryPriceCandidate: number;
  stopLoss: number;
  takeProfit: number;
  strategyVersion: string;
  snapshotId: string;
  // strategyA.decide()と同じ並び順（score降順→confidence降順→code昇順）でのBUY候補内の順位。
  selectionRank: number;
  selectedForPaperTrading: boolean;
  // 選ばれなかった理由（例："max_positions_reached"「最大保有数3銘柄のため見送り」
  // "invalid_stop_loss"「SL不正で見送り」"already_held"「既に保有中」等）。
  // 選ばれた場合はnull。
  rejectionReason: string | null;
}

export interface ChallengeDailyRecord {
  // --- 基本 ---
  challengeId: string;
  date: string; // YYYY-MM-DD
  tradingDayNumber: number; // 運用何営業日目か（1始まり、Daily Record生成回数ベース）
  strategyVersion: string;
  marketSessionStatus: "trading_day"; // Phase1では休場日はDaily Record自体を生成しないため常にこの値

  // --- 資産（Paper Trading本体の確定値をそのまま転記。再計算しない） ---
  initialCapital: number;
  cash: number;
  positionsValue: number;
  totalAssets: number;
  dailyPnl: number; // 前営業日Daily RecordのtotalAssetsとの差
  dailyReturnPercent: number;
  cumulativePnl: number; // totalAssets - initialCapital
  cumulativeReturnPercent: number; // PaperPortfolioSnapshot.cumulativeReturnPercentをそのまま転記
  peakTotalAssets: number;
  drawdownPercent: number;
  maxDrawdownPercent: number; // 開始日からの最大Drawdown（computePerformanceMetricsを再利用）

  // --- Benchmark ---
  benchmarkStartValue: number; // initialCapital（Benchmark開始時の仮想評価額）
  benchmarkCurrentValue: number; // PaperPortfolioSnapshot.benchmarkValueをそのまま転記
  benchmarkCumulativeReturnPercent: number; // PaperPortfolioSnapshot.benchmarkReturnPercentをそのまま転記
  excessReturnPercentagePoints: number; // cumulativeReturnPercent - benchmarkCumulativeReturnPercent
  benchmarkMethod: "price_return";
  benchmarkVersion: 1;

  // --- 朝のAI判断（Universe Verification・Signal Snapshotの確定値をそのまま転記） ---
  universeSize: number | null;
  buySignalCount: number;
  sellSignalCount: number;
  waitSignalCount: number;
  morningSnapshotDate: string | null; // Signal Snapshotのdate（=当日）。捕捉できなかった日はnull
  scanStartedAt: string | null;
  scanCompletedAt: string | null;
  snapshotCapturedAt: string | null;

  // --- Paper Trading（当日の約定と、開始日からの累計成績） ---
  entryCount: number; // 当日のENTRY件数
  exitCount: number; // 当日のEXIT件数
  openPositionCount: number;
  realizedPnlToday: number;
  cumulativeRealizedPnl: number;
  winCount: number; // 開始日からの累計（computePerformanceMetricsを再利用）
  lossCount: number;
  winRatePercent: number | null;
  profitFactor: number | null;

  // --- 当日の取引明細 ---
  trades: ChallengeDailyTradeEntry[];

  // --- 選定理由の復元用データ ---
  selections: ChallengeSelectionRecord[];

  // --- Phase 2配当（現時点では常に0。将来値を追加しても既存フィールドは壊さない） ---
  dailyDividendIncome: number;
  cumulativeDividendIncome: number;

  // --- 証拠性・再現性（§8） ---
  sourceRefs: {
    portfolioSnapshotDate: string; // PaperPortfolioSnapshot.date
    tradeIds: string[]; // PaperTrade.id[]
    positionIds: string[]; // PaperPosition.id[]（当日ENTRY/EXITしたもの）
  };
  generatedAt: string; // このDaily Recordが生成された時刻（監査用）
}

// ============================================================================
// 4. Milestone / Event
// ============================================================================

export type ChallengeEventType =
  | "challenge_started"
  | "first_entry"
  | "first_exit"
  | "first_profit"
  | "first_loss"
  | "first_stop_loss"
  | "first_take_profit"
  | "new_equity_high"
  | "new_max_drawdown"
  | "winning_streak"
  | "losing_streak"
  | "equity_milestone_up"
  | "equity_milestone_down"
  | "benchmark_cross_above"
  | "benchmark_cross_below"
  | "trading_day_milestone";

export interface ChallengeEvent {
  // idempotency key。同一イベントは同一eventIdになるよう構成し、二重記録を防ぐ。
  eventId: string;
  eventType: ChallengeEventType;
  occurredAt: string; // ISO8601（対象日の生成時刻）
  tradingDayNumber: number;
  totalAssets: number;
  cumulativeReturnPercent: number;
  relatedTradeId: string | null;
  relatedCode: string | null;
  snapshotId: string | null;
  strategyVersion: string;
  eventData: Record<string, unknown>;
  createdAt: string;
}

// ============================================================================
// 5. Strategy変更履歴
// ============================================================================

export interface ChallengeStrategyHistoryEntry {
  id: string; // = strategyVersion（1バージョン1エントリ、重複登録不可）
  strategyVersion: string;
  effectiveFrom: string; // YYYY-MM-DD
  previousVersion: string | null;
  changeSummary: string;
  reason: string;
  dataWindowUsedForDecision: string | null; // 例 "2026-08-20〜2026-09-30（30営業日）"
  recordedAt: string; // このエントリ自体が記録された時刻
}

// ============================================================================
// 6. YouTube用集計データ
// ============================================================================

export interface YoutubeReportTradeRef {
  date: string;
  code: string;
  companyName: string;
  realizedPnl: number;
  returnPercent: number;
}

export interface YoutubeReportDayRef {
  date: string;
  dailyPnl: number;
  dailyReturnPercent: number;
}

export interface YoutubeReportSeriesPoint {
  date: string;
  totalAssets: number;
  cumulativeReturnPercent: number;
}

export interface YoutubeReportBenchmarkSeriesPoint {
  date: string;
  benchmarkValue: number;
  benchmarkCumulativeReturnPercent: number;
}

export interface YoutubeReport {
  from: string;
  to: string;
  tradingDayCount: number;
  startingAssets: number;
  endingAssets: number;
  pnl: number;
  returnPercent: number;
  benchmarkReturnPercent: number;
  excessReturnPercentagePoints: number;
  maxDrawdownPercent: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRatePercent: number | null;
  profitFactor: number | null;
  bestTrade: YoutubeReportTradeRef | null;
  worstTrade: YoutubeReportTradeRef | null;
  bestDay: YoutubeReportDayRef | null;
  worstDay: YoutubeReportDayRef | null;
  milestones: ChallengeEvent[];
  strategyVersionsUsed: ChallengeStrategyHistoryEntry[];
  buySignalTotal: number;
  sellSignalTotal: number;
  waitSignalTotal: number;
  entryTotal: number;
  exitTotal: number;
  equitySeries: YoutubeReportSeriesPoint[];
  benchmarkSeries: YoutubeReportBenchmarkSeriesPoint[];
  generatedAt: string;
}
