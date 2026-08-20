import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureSignalSnapshot, getSignalSnapshotRows } from "../../paperTrading/signalSnapshotStore";
import { initializeUniverseVerification } from "../initialize";
import { readUniverseVerificationLog } from "../store";

function withTempDataDirs<T>(fn: () => Promise<T>): Promise<T> {
  const paperDir = mkdtempSync(path.join(tmpdir(), "paper-trading-test-"));
  const universeDir = mkdtempSync(path.join(tmpdir(), "universe-verification-test-"));
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

function screenedStock(code: string, signal: "買い" | "売り" | "待ち", score: number) {
  return {
    code, symbol: `${code}.T`, name: `銘柄${code}`, score, confidence: 75, price: 1000,
    signal, entryPriority: 1, risk: "中" as const, strategyHeadline: "", aiComment: "",
    entryBlock: { level: "none" as const, reason: null }, todayAction: "今すぐエントリー" as const,
    todayActionReason: "", reasons: [], entryPrice: 1000, stopLoss: 950, takeProfit: 1100,
    indicatorValues: DUMMY_INDICATOR_VALUES,
  };
}

const DATE = "2026-08-20";
function fakeCachedScan(codes: { code: string; signal: "買い" | "売り" | "待ち"; score: number }[]) {
  const candidates = codes.map((c) => screenedStock(c.code, c.signal, c.score));
  return {
    dateKey: DATE,
    scanStartedAt: `${DATE}T08:29:30.000Z`,
    scannedAt: `${DATE}T08:30:00.000Z`,
    scannedCount: candidates.length,
    failedCount: 0,
    candidates,
  };
}

// テストケース3: 225銘柄朝Snapshotを保存できる（ここでは3銘柄の縮小版で確認）
test("Snapshot捕捉後、initializeUniverseVerificationで全銘柄分のpendingレコードが作成される", async () => {
  await withTempDataDirs(async () => {
    const codes = [
      { code: "7203", signal: "買い" as const, score: 85 },
      { code: "9984", signal: "売り" as const, score: 30 },
      { code: "6758", signal: "待ち" as const, score: 55 },
    ];
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(codes), strategyVersion: "strategy-a-standard@1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const result = await initializeUniverseVerification(DATE);
    assert.equal(result.initialized, true);
    assert.equal(result.createdCount, 3);
    assert.equal(result.alreadyExistedCount, 0);

    const records = await readUniverseVerificationLog();
    assert.equal(records.length, 3);

    const buy = records.find((r) => r.code === "7203")!;
    assert.equal(buy.schemaVersion, 1);
    assert.equal(buy.source, "universe-225-snapshot");
    assert.equal(buy.signal, "買い");
    assert.equal(buy.outcome, "pending");
    assert.equal(buy.day1, null);
    assert.equal(buy.day3, null);
    assert.equal(buy.day5, null);

    // テストケース14: BUY/SELL/WAITをすべて保存・追跡できる
    assert.ok(records.some((r) => r.signal === "買い"));
    assert.ok(records.some((r) => r.signal === "売り"));
    assert.ok(records.some((r) => r.signal === "待ち"));

    // テストケース15: strategyVersionを保持できる
    assert.ok(records.every((r) => r.strategyVersion === "strategy-a-standard@1"));

    // テストケース17: Paper TradingのSignal Snapshotとの整合性
    const snapshotRows = await getSignalSnapshotRows(DATE);
    for (const record of records) {
      const snapshotRow = snapshotRows.find((s) => s.id === record.snapshotId)!;
      assert.ok(snapshotRow, "snapshotIdでSignal Snapshot側の行を一意に特定できる");
      assert.equal(record.score, snapshotRow.score);
      assert.equal(record.signal, snapshotRow.signal);
      assert.equal(record.stopLoss, snapshotRow.stopLoss);
      assert.equal(record.takeProfit, snapshotRow.takeProfit);
      assert.equal(record.priceAtJudgment, snapshotRow.priceAtJudgment);
    }
  });
});

// テストケース18: 同一処理を再実行しても二重記録されない
test("initializeUniverseVerificationを2回実行しても二重記録されない", async () => {
  await withTempDataDirs(async () => {
    const codes = [{ code: "7203", signal: "買い" as const, score: 85 }];
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(codes), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const first = await initializeUniverseVerification(DATE);
    assert.equal(first.createdCount, 1);

    const second = await initializeUniverseVerification(DATE);
    assert.equal(second.createdCount, 0);
    assert.equal(second.alreadyExistedCount, 1);

    const records = await readUniverseVerificationLog();
    assert.equal(records.length, 1, "2回実行しても1件のまま");
  });
});

// fail-safe: 225銘柄スキャン未完了時（Snapshot未捕捉）は不完全なSnapshotを正常扱いしない
test("Signal Snapshotが未捕捉の場合、initializeUniverseVerificationは何も作成しない（fail-safe）", async () => {
  await withTempDataDirs(async () => {
    // captureSignalSnapshotを一度も呼ばない＝当日のSnapshotが存在しない状態
    const result = await initializeUniverseVerification(DATE);
    assert.equal(result.initialized, false);
    assert.equal(result.reason, "snapshot_not_captured");
    assert.equal(result.createdCount, 0);

    const records = await readUniverseVerificationLog();
    assert.equal(records.length, 0);
  });
});

// テストケース16（部分）: 既存30銘柄verification（app/lib/verification）とは完全に独立したディレクトリ
test("universeVerificationのデータ保存先は既存verification/data/log.jsonとは異なる", async () => {
  await withTempDataDirs(async () => {
    const { dataDir: paperDataDir } = await import("../../paperTrading/store");
    const universeDir = process.env.UNIVERSE_VERIFICATION_DATA_DIR!;
    const verificationDir = path.join(process.cwd(), "app/lib/verification/data");
    assert.notEqual(universeDir, verificationDir);
    assert.notEqual(universeDir, paperDataDir());
    assert.ok(!universeDir.includes("app/lib/verification/data"));
  });
});
