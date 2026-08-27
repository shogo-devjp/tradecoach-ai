import type { FxSignal, MarketRegime, TimeframeDirection } from "../types";

// FX版Paper Trading（仮想運用）専用の型定義。
// 分析ロジック（app/lib/fx/types.ts等）とは意図的に分離し、資金管理・約定シミュレーション・
// 記録だけに関心を持つ層として設計する（分析エンジンの型に依存はするが、逆方向の依存は作らない）。

export type PositionSide = "LONG" | "SHORT";

export type ExitReason = "TAKE_PROFIT" | "STOP_LOSS" | "TIMEOUT";

export type EntryRejectionReason =
  | "MIN_UNIT_NOT_MET" // リスク許容額に対してSL距離が遠すぎ、最小取引単位分すら建てられない
  | "ENTRY_TIMEOUT"; // エントリー待ち（entryTimeoutMs）の間に価格がEntryゾーンへ来なかった

// 分析結果のうち、記録・後日の検証に必要な部分だけを抜き出したスナップショット。
// analyzeFxPairの出力全体を保存すると肥大化するため、要件で明示された項目に絞る。
export interface AnalysisSnapshot {
  buyScore: number;
  sellScore: number;
  confidence: number;
  marketRegime: MarketRegime;
  timeframeDirections: TimeframeDirection[];
  reasons: string[];
}

// シグナルが出てから、Entryゾーンへの到達を待っている状態。
export interface PendingSignal {
  id: string; // `${signal timestamp}`
  signal: Extract<FxSignal, "買い" | "売り">;
  side: PositionSide;
  createdAt: number; // epoch ms（analyzeFxPairのtimestamp）
  expiresAt: number; // createdAt + entryTimeoutMs
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  snapshot: AnalysisSnapshot;
}

// 実際に建てた仮想ポジション。
export interface PaperPosition {
  id: string;
  side: PositionSide;
  entryPrice: number; // スプレッド込みの約定価格
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  units: number;
  riskAmountJPY: number;
  equityAtEntry: number;
  openedAt: number;
  maxHoldUntil: number; // openedAt + 5営業日
  lastMonitoredAt: number; // 直近の監視済み時刻（OHLC監視の起点）
  entryReason: string;
  snapshot: AnalysisSnapshot;
}

export interface ClosedTrade {
  id: string;
  side: PositionSide;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  units: number;
  riskAmountJPY: number;
  openedAt: number;
  closedAt: number;
  exitPrice: number;
  exitReason: ExitReason;
  equityAtEntry: number;
  equityAfter: number;
  pnlJPY: number;
  pnlPercent: number;
  realizedR: number; // pnlJPY / riskAmountJPY
  entryReason: string;
  exitReasonNote: string;
  snapshot: AnalysisSnapshot;
  analysisVersion: string;
}

// 見送り記録（エントリー未成立・最小ロット未満）。勝敗には数えないが、後から
// 「どれだけの候補が実際にはエントリーできなかったか」を検証できるように残す。
export interface SkippedSignal {
  id: string;
  signal: Extract<FxSignal, "買い" | "売り">;
  side: PositionSide;
  createdAt: number;
  reason: EntryRejectionReason;
  snapshot: AnalysisSnapshot;
}

export interface PaperTradingState {
  equity: number;
  pendingSignal: PendingSignal | null;
  position: PaperPosition | null;
  lastTickAt: number | null;
}

export interface PaperTradingStore {
  state: PaperTradingState;
  trades: ClosedTrade[];
  skipped: SkippedSignal[];
}
