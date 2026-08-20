import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runMorningOrchestration } from "../morningOrchestration";
import { getMorningOrchestrationRecord } from "../orchestrationStore";
import { readUniverseVerificationLog } from "../store";
import type { CachedScanLike } from "@/app/lib/paperTrading/signalSnapshotStore";

// ①スキャン完了確認 → ②Snapshot固定 → ③Verification初期化 を、固定時刻ではなく
// 「前段の正常完了」をトリガーに直列実行することを検証する（設計要求：追加確認①）。
// Paper Trading側（PAPER_TRADING_DATA_DIR）とVerification側（UNIVERSE_VERIFICATION_DATA_DIR）を
// 両方隔離する。既存30銘柄verification（VERIFICATION_DATA_DIR未設定＝本番ディレクトリ）は
// このテストでは一切触れない（initializeUniverseVerification・captureSignalSnapshotとも
// 既存30銘柄verification/data/を参照しないため、環境変数を設定する必要自体がない）。
function withTempDirs<T>(fn: () => Promise<T>): Promise<T> {
  const paperDir = mkdtempSync(path.join(tmpdir(), "orchestration-paper-"));
  const universeDir = mkdtempSync(path.join(tmpdir(), "orchestration-universe-"));
  process.env.PAPER_TRADING_DATA_DIR = paperDir;
  process.env.UNIVERSE_VERIFICATION_DATA_DIR = universeDir;
  return fn().finally(() => {
    rmSync(paperDir, { recursive: true, force: true });
    rmSync(universeDir, { recursive: true, force: true });
    delete process.env.PAPER_TRADING_DATA_DIR;
    delete process.env.UNIVERSE_VERIFICATION_DATA_DIR;
  });
}

const DUMMY_INDICATOR_VALUES = {
  rsi: 55, macdLine: 1, macdSignal: 0.5, macdHistogram: 0.5,
  sma5: 100, sma25: 98, sma75: 95, ma5DiffPercent: 2, ma25DiffPercent: 4, ma75DiffPercent: 6,
};

function fakeCachedScan(date: string, overrides: Partial<CachedScanLike> = {}): CachedScanLike {
  return {
    dateKey: date,
    scanStartedAt: `${date}T08:29:30.000Z`,
    scannedAt: `${date}T08:30:00.000Z`,
    scannedCount: 2,
    failedCount: 0,
    candidates: [
      {
        code: "7203", symbol: "7203.T", name: "トヨタ自動車", score: 85, confidence: 80, price: 3000,
        signal: "買い" as const, entryPriority: 1, risk: "中" as const, strategyHeadline: "", aiComment: "",
        entryBlock: { level: "none" as const, reason: null }, todayAction: "今すぐエントリー" as const,
        todayActionReason: "", reasons: [], entryPrice: 3000, stopLoss: 2920, takeProfit: 3200,
        indicatorValues: DUMMY_INDICATOR_VALUES,
      },
      {
        code: "6758", symbol: "6758.T", name: "ソニーグループ", score: 60, confidence: 55, price: 2000,
        signal: "待ち" as const, entryPriority: 2, risk: "中" as const, strategyHeadline: "", aiComment: "",
        entryBlock: { level: "none" as const, reason: null }, todayAction: "様子見" as const,
        todayActionReason: "", reasons: [], entryPrice: 2000, stopLoss: 1950, takeProfit: 2100,
        indicatorValues: DUMMY_INDICATOR_VALUES,
      },
    ],
    ...overrides,
  };
}

const FIXED_DATE = "2026-08-20";
const FIXED_NOW_0835 = new Date("2026-08-20T08:35:00+09:00"); // 9:00 JST締切より前

test("スキャン完了確認直後にSnapshot固定→Verification初期化まで一連で実行され、追跡フィールドが記録される", async () => {
  await withTempDirs(async () => {
    const result = await runMorningOrchestration({
      now: FIXED_NOW_0835,
      cachedScan: fakeCachedScan(FIXED_DATE),
    });

    assert.equal(result.snapshot.captured, true);
    assert.ok(result.verification, "③成功時は④が続けて試行される");
    assert.equal(result.verification!.initialized, true);
    assert.equal(result.verification!.createdCount, 2);

    const record = await getMorningOrchestrationRecord(FIXED_DATE);
    assert.ok(record);
    assert.equal(record!.scanStartedAt, `${FIXED_DATE}T08:29:30.000Z`);
    assert.equal(record!.scanCompletedAt, `${FIXED_DATE}T08:30:00.000Z`);
    assert.equal(record!.universeSize, 2);
    assert.equal(record!.successCount, 2);
    assert.equal(record!.failedCount, 0);
    assert.equal(record!.snapshotCaptured, true);
    assert.ok(record!.snapshotCapturedAt);
    assert.equal(record!.verificationInitialized, true);
    assert.ok(record!.verificationInitializedAt);
    assert.equal(record!.verificationCreatedCount, 2);

    const uvLog = await readUniverseVerificationLog();
    assert.equal(uvLog.length, 2);
  });
});

test("スキャン未完了（cachedScanなし）の場合はSnapshotもVerificationも作成されずfail-safeになる", async () => {
  await withTempDirs(async () => {
    const result = await runMorningOrchestration({ now: FIXED_NOW_0835, cachedScan: null });

    assert.equal(result.snapshot.captured, false);
    assert.equal(result.snapshot.reason, "cache_unavailable");
    assert.equal(result.verification, null, "③が失敗した場合、④は試行しない");

    const record = await getMorningOrchestrationRecord(FIXED_DATE);
    assert.equal(record!.snapshotCaptured, false);
    assert.equal(record!.snapshotSkipReason, "cache_unavailable");
    assert.equal(record!.verificationInitialized, false);
    assert.equal(record!.verificationInitializedAt, null);

    const uvLog = await readUniverseVerificationLog();
    assert.equal(uvLog.length, 0, "不完全な225件verificationを作らない");
  });
});

test("9:00 JSTを過ぎている場合はSnapshotもVerificationも作成されない", async () => {
  await withTempDirs(async () => {
    const after9am = new Date("2026-08-20T09:05:00+09:00");
    const result = await runMorningOrchestration({ now: after9am, cachedScan: fakeCachedScan(FIXED_DATE) });

    assert.equal(result.snapshot.captured, false);
    assert.equal(result.snapshot.reason, "after_market_open");
    assert.equal(result.verification, null);

    const uvLog = await readUniverseVerificationLog();
    assert.equal(uvLog.length, 0);
  });
});

test("スキャン未完了（成功件数+失敗件数が対象数未満）の場合はfail-safeになる", async () => {
  await withTempDirs(async () => {
    const incomplete = fakeCachedScan(FIXED_DATE, { scannedCount: 225, failedCount: 0 }); // candidates.length=2 < 225
    const result = await runMorningOrchestration({ now: FIXED_NOW_0835, cachedScan: incomplete });

    assert.equal(result.snapshot.captured, false);
    assert.equal(result.snapshot.reason, "incomplete_scan");
    assert.equal(result.verification, null);

    const uvLog = await readUniverseVerificationLog();
    assert.equal(uvLog.length, 0);
  });
});

test("同一日に再実行してもSnapshot・Verificationとも二重生成されない（冪等）", async () => {
  await withTempDirs(async () => {
    const first = await runMorningOrchestration({ now: FIXED_NOW_0835, cachedScan: fakeCachedScan(FIXED_DATE) });
    assert.equal(first.verification!.createdCount, 2);

    const second = await runMorningOrchestration({ now: FIXED_NOW_0835, cachedScan: fakeCachedScan(FIXED_DATE) });
    assert.equal(second.snapshot.captured, true, "Snapshotは既存分がそのまま返る（上書きしない）");
    assert.equal(second.verification!.createdCount, 0, "Verificationは新規作成0件");
    assert.equal(second.verification!.alreadyExistedCount, 2);

    const uvLog = await readUniverseVerificationLog();
    assert.equal(uvLog.length, 2, "レコード総数は増えない");
  });
});
