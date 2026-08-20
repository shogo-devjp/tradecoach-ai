import type {
  EntryBlockLevel,
  IndicatorRawValues,
  RiskLevel,
  Signal,
  TodayAction,
} from "../technicalAnalysis/types";
// 既存30銘柄verification（app/lib/verification）のVerificationOutcomeをそのまま再利用する
// （勝手に別基準を作らず、既存仕様との整合性を保つ）。
import type { VerificationOutcome, DayResult } from "../verification/types";
import type { SnapshotCaptureResult } from "../paperTrading/types";

export type { VerificationOutcome, DayResult };

// ============================================================================
// 225銘柄universeVerification（Version 1.5想定・新方式）
// ============================================================================
// 目的：「日経225全225銘柄について、毎営業日の朝TradeCoachが何と判断したか」を
// immutableなSignal Snapshot（app/lib/paperTrading/signalSnapshotStore.ts、
// Paper Tradingと共有する唯一の判断ソース）を起点に固定し、1/3/5営業日後の
// 実際の値動きと突き合わせて長期的な判断精度を蓄積する。
//
// 既存30銘柄verification（app/lib/verification、上書き可能なupsert方式）とは
// 完全に独立したファイル・ロジックとして共存させる。既存データは一切変更しない。

export interface UniverseVerificationRecord {
  id: string; // = SignalSnapshot.id（`${date}-${code}`）。1つのSnapshot行と1:1対応
  schemaVersion: 1; // 新方式データであることを明示（既存30銘柄データにはこのフィールドは無い）
  source: "universe-225-snapshot"; // 既存30銘柄upsert方式と区別するための識別子
  snapshotId: string; // 由来するSignalSnapshotのid（唯一の判断ソースへの参照。監査可能性）
  date: string; // YYYY-MM-DD（判定日）
  code: string;
  companyName: string;
  signal: Signal; // 買い/売り/待ち
  score: number;
  confidence: number;
  priceAtJudgment: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  entryBlockLevel: EntryBlockLevel;
  riskLevel: RiskLevel;
  todayAction: TodayAction;
  strategyVersion: string;
  analyzedAt: string; // ISO8601
  scanStartedAt: string; // ISO8601
  scanCompletedAt: string; // ISO8601
  snapshotCapturedAt: string; // ISO8601
  // 判断の再現・後解析用（RSI/MACD/移動平均等の生値）。将来のScore帯別・指標別成績分析に使う。
  indicatorValues: IndicatorRawValues;
  day1: DayResult | null;
  day3: DayResult | null;
  day5: DayResult | null;
  // 既存verification/types.tsのVerificationOutcomeをそのまま使う（pending/win/loss/neutral/observed）。
  // BUY/SELLは方向性のある勝敗（既存resolveDirectionalOutcome()をそのまま再利用）。
  // WAITは「observed」とし、二値の正解/不正解にせず、day1/3/5の価格・騰落率という生データを
  // 残すことで「待つ判断が妥当だったか」を後から分析できるようにする（既存仕様と同じ思想）。
  outcome: VerificationOutcome;
  createdAt: string; // このレコードが作成された時刻（監査用）
}

// ============================================================================
// 初期化（朝Snapshot固定 → universeVerificationレコード作成）の結果
// ============================================================================

export type InitializeSkipReason =
  | "snapshot_not_captured" // 当日のSignal Snapshotがまだ存在しない、またはfail-safeで未捕捉
  | "no_rows"; // Snapshotはcaptured:trueだが対象行が0件（通常発生しない想定）

export interface InitializeUniverseVerificationResult {
  date: string;
  initialized: boolean; // falseの場合はfail-safe（新規レコードなし）
  reason?: InitializeSkipReason;
  createdCount: number; // 新規作成したレコード数
  alreadyExistedCount: number; // 既に存在していた（=今回は何もしなかった）レコード数
  universeSize?: number;
  succeededCount?: number;
  failedCount?: number;
}

export interface SettleUniverseVerificationResult {
  processedCount: number; // settle対象として調べたpendingレコード数
  updatedCount: number; // day1/day3/day5/outcomeのいずれかが更新されたレコード数
}

// ============================================================================
// 朝オーケストレーション（②スキャン完了確認 → ③Snapshot固定 → ④Verification初期化）
// ============================================================================
// 固定時刻（例:8:33）依存を廃止し、「前段の正常完了」をトリガーに次段を直後に実行する
// ための1日1回の実行記録。冪等：captureSignalSnapshot()・initializeUniverseVerification()が
// それぞれ既に上書き禁止・重複防止であるため、本レコードも同一dateなら安全に上書き更新できる
// （実行結果の反映のみで、Snapshot/Verificationレコード自体を再生成することはない）。
export interface MorningOrchestrationRecord {
  date: string;
  scanStartedAt: string | null; // ②スキャン開始時刻（getCachedScan().scanStartedAt）
  scanCompletedAt: string | null; // ②スキャン完了時刻（getCachedScan().scannedAt）
  universeSize: number | null;
  successCount: number | null;
  failedCount: number | null;
  snapshotCaptured: boolean; // ③Snapshot固定に成功したか
  snapshotCapturedAt: string | null;
  snapshotSkipReason: string | null; // fail-safe理由（cache_unavailable等）
  verificationInitialized: boolean; // ④Verification初期化に成功したか（③成功時のみ試行する）
  verificationInitializedAt: string | null;
  verificationCreatedCount: number | null;
  verificationSkipReason: string | null;
  updatedAt: string; // このレコードが最後に更新された時刻（監査用）
}

export interface MorningOrchestrationResult {
  date: string;
  snapshot: SnapshotCaptureResult;
  verification: InitializeUniverseVerificationResult | null; // ③が失敗した場合はnull（④は試行しない）
  record: MorningOrchestrationRecord;
}
