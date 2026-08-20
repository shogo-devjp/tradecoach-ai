import { getSignalSnapshotRows, getSnapshotCaptureResult } from "../paperTrading/signalSnapshotStore";
import { enqueue, readUniverseVerificationLog, writeUniverseVerificationLogRaw } from "./store";
import type { InitializeUniverseVerificationResult, UniverseVerificationRecord } from "./types";

// 朝Snapshot（app/lib/paperTrading/signalSnapshotStore.ts、Paper Tradingと共有する唯一の
// 判断ソース）が正常に固定されたことを確認した上で、225銘柄全件分のuniverseVerification
// レコード（pending状態）を作成する。
//
// fail-safe：Signal Snapshot自体が未捕捉（cache_unavailable/incomplete_scan/too_many_failures/
// after_market_open）の場合は、不完全なSnapshotを正常扱いせず何も作成しない
// （＝225銘柄スキャン未完了時は不完全なSnapshotを正常扱いしない、という要件をSnapshot層の
// fail-safeにそのまま乗せて満たす。二重実装しない）。
//
// 冪等性：同一date+code+strategyVersion（= id = snapshotId）のレコードが既に存在する場合は
// 何もしない（上書きしない）。同一処理を再実行しても二重記録されない。
export async function initializeUniverseVerification(date: string): Promise<InitializeUniverseVerificationResult> {
  return enqueue(async () => {
    const captureResult = await getSnapshotCaptureResult(date);
    if (!captureResult || !captureResult.captured) {
      return {
        date,
        initialized: false,
        reason: "snapshot_not_captured",
        createdCount: 0,
        alreadyExistedCount: 0,
      };
    }

    const rows = await getSignalSnapshotRows(date);
    if (rows.length === 0) {
      return { date, initialized: false, reason: "no_rows", createdCount: 0, alreadyExistedCount: 0 };
    }

    const existing = await readUniverseVerificationLog();
    const existingIds = new Set(existing.map((r) => r.id));

    const now = new Date().toISOString();
    let createdCount = 0;
    let alreadyExistedCount = 0;
    const toAppend: UniverseVerificationRecord[] = [];

    for (const row of rows) {
      if (existingIds.has(row.id)) {
        alreadyExistedCount++;
        continue;
      }
      toAppend.push({
        id: row.id,
        schemaVersion: 1,
        source: "universe-225-snapshot",
        snapshotId: row.id,
        date: row.date,
        code: row.code,
        companyName: row.name,
        signal: row.signal,
        score: row.score,
        confidence: row.confidence,
        priceAtJudgment: row.priceAtJudgment,
        entryPrice: row.entryPriceCandidate,
        stopLoss: row.stopLoss,
        takeProfit: row.takeProfit,
        entryBlockLevel: row.entryBlockLevel,
        riskLevel: row.riskLevel,
        todayAction: row.todayAction,
        strategyVersion: row.strategyVersion,
        analyzedAt: row.analyzedAt,
        scanStartedAt: row.scanStartedAt,
        scanCompletedAt: row.scanCompletedAt,
        snapshotCapturedAt: row.snapshotCapturedAt,
        indicatorValues: row.indicatorValues,
        day1: null,
        day3: null,
        day5: null,
        outcome: "pending",
        createdAt: now,
      });
      createdCount++;
    }

    if (toAppend.length > 0) {
      // enqueue()の中にいるため、再度enqueue()を通す updateUniverseVerificationRecords() ではなく
      // ロックを取り直さない生の書き込みを直接呼ぶ（デッドロック回避。store.tsのコメント参照）。
      await writeUniverseVerificationLogRaw([...existing, ...toAppend]);
    }

    return {
      date,
      initialized: true,
      createdCount,
      alreadyExistedCount,
      universeSize: captureResult.universeSize,
      succeededCount: captureResult.succeededCount,
      failedCount: captureResult.failedCount,
    };
  });
}
