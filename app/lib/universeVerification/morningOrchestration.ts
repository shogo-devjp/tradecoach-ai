import { getCachedScan } from "@/app/lib/screening/cache";
import { captureSnapshotForStrategy } from "@/app/lib/paperTrading/engine";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import type { CachedScanLike } from "@/app/lib/paperTrading/signalSnapshotStore";
import type { SnapshotCaptureResult } from "@/app/lib/paperTrading/types";
import { isTradingDayJst, jstDateKey, jstHHMM } from "@/app/lib/marketCalendar";
import { initializeUniverseVerification } from "./initialize";
import { upsertMorningOrchestrationRecord } from "./orchestrationStore";
import type { MorningOrchestrationResult } from "./types";

function todayKeyJst(now: Date): string {
  return jstDateKey(now);
}

// 既存signalSnapshotStore.tsのMARKET_OPEN_DEADLINE_HHMMと完全に同じ値。
// API側の入口ガード（本ファイル）と、既存のcaptureSignalSnapshot()内部の締切
// （二重防御の内側）の両方で独立に判定し、どちらか一方が壊れても他方が朝Snapshotの
// 9:00超過作成を防げるようにする。値を変更する場合は両方を同期させること。
const MARKET_OPEN_DEADLINE_HHMM = "09:00";

export interface RunMorningOrchestrationInput {
  // テスト用の時刻注入・キャッシュ済みスキャン注入。本番では両方省略し、実際の現在時刻と
  // getCachedScan()（8:30の朝スキャン、②の完了確認そのもの）をそのまま使う。
  now?: Date;
  cachedScan?: CachedScanLike | null;
}

// 朝処理を「固定時刻（例:8:33）」ではなく「前段の正常完了」をトリガーに直列実行する。
//
// ① 8:30 朝スクリーニング開始（既存 screening/signals/route.ts、本関数の外側で実行済み前提）
// ② スキャン正常完了の確認（getCachedScan() が当日分を返すこと自体が確認）
// ③ 完了を確認した直後にSignal Snapshotを固定（captureSnapshotForStrategy）
// ④ Snapshot固定の成功を確認した直後に、間を置かずUniverse Verification 225件をinitialize
//    （③が失敗（fail-safe）した場合は④自体を試行しない＝不完全な225件verificationを作らない）
//
// ③④とも9:00 JST締切は各処理内部（signalSnapshotStore.ts / initialize.ts経由のSnapshot依存）で
// 判定される。本関数の入口でも同じ9:00締切・非営業日判定を独立に行う（二重防御。下記参照）。
export async function runMorningOrchestration(input: RunMorningOrchestrationInput = {}): Promise<MorningOrchestrationResult> {
  const now = input.now ?? new Date();
  const date = todayKeyJst(now);

  // --- API側の時間帯fail-safe（二重防御。既存のcaptureSignalSnapshot()内部の9:00締切とは
  //     独立した「呼び出しの入口」でのガード）。
  //     テストはnowを明示的に注入して時刻を制御する（本番と全く同じこの関数・同じ判定を通す。
  //     「テスト時だけ無条件通過する」ような分岐は存在しない）。
  //     ①非営業日（土日・年末年始・祝日）は新規Snapshot固定を試みない。
  //     ②9:00 JST以降は新規Snapshot固定を拒否する（既存の内部締切と同じ時刻・同じreason文字列
  //       "after_market_open"にして整合を保つ）。
  const guardReason = !isTradingDayJst(now) ? "not_a_trading_day" : jstHHMM(now) >= MARKET_OPEN_DEADLINE_HHMM ? "after_market_open" : null;

  if (guardReason) {
    const snapshotResult: SnapshotCaptureResult = { date, captured: false, reason: guardReason, capturedAt: null };
    const record = await upsertMorningOrchestrationRecord(date, {
      scanStartedAt: null,
      scanCompletedAt: null,
      universeSize: null,
      successCount: null,
      failedCount: null,
      snapshotCaptured: false,
      snapshotCapturedAt: null,
      snapshotSkipReason: guardReason,
      verificationInitialized: false,
      verificationInitializedAt: null,
      verificationCreatedCount: null,
      verificationSkipReason: null,
    });
    return { date, snapshot: snapshotResult, verification: null, record };
  }

  // ② スキャン完了確認（本番は getCachedScan()。テストはcachedScanを直接注入できる）
  const cached = input.cachedScan !== undefined ? input.cachedScan : getCachedScan();

  // ③ 完了確認の直後にSnapshot固定（captureSignalSnapshot自体が冪等・上書き禁止・fail-safe。
  //    ここでも9:00締切は独立に再判定される＝二重防御の内側）
  const snapshotResult = await captureSnapshotForStrategy({
    strategyId: STRATEGY_A_ID,
    cachedScan: cached,
    now,
  });

  // ④ ③が成功した場合のみ、間を置かずVerification初期化を試行する
  const verificationResult = snapshotResult.captured ? await initializeUniverseVerification(date) : null;

  const record = await upsertMorningOrchestrationRecord(date, {
    scanStartedAt: cached?.scanStartedAt ?? null,
    scanCompletedAt: snapshotResult.scanCompletedAt ?? cached?.scannedAt ?? null,
    universeSize: snapshotResult.universeSize ?? cached?.scannedCount ?? null,
    successCount: snapshotResult.succeededCount ?? cached?.candidates.length ?? null,
    failedCount: snapshotResult.failedCount ?? cached?.failedCount ?? null,
    snapshotCaptured: snapshotResult.captured,
    snapshotCapturedAt: snapshotResult.capturedAt,
    snapshotSkipReason: snapshotResult.captured ? null : snapshotResult.reason ?? null,
    verificationInitialized: verificationResult?.initialized ?? false,
    verificationInitializedAt: verificationResult?.initialized ? now.toISOString() : null,
    verificationCreatedCount: verificationResult?.createdCount ?? null,
    verificationSkipReason:
      verificationResult && !verificationResult.initialized ? verificationResult.reason ?? null : null,
  });

  return { date, snapshot: snapshotResult, verification: verificationResult, record };
}
