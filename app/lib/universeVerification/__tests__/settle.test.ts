import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readUniverseVerificationLog, writeUniverseVerificationLogRaw } from "../store";
import { settlePendingUniverseVerificationRecords, type FutureClosesProvider } from "../settle";
import type { UniverseVerificationRecord } from "../types";

function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "universe-verification-test-"));
  process.env.UNIVERSE_VERIFICATION_DATA_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.UNIVERSE_VERIFICATION_DATA_DIR;
  });
}

const DUMMY_INDICATOR_VALUES = {
  rsi: 55, macdLine: 1, macdSignal: 0.5, macdHistogram: 0.5,
  sma5: 100, sma25: 98, sma75: 95, ma5DiffPercent: 2, ma25DiffPercent: 4, ma75DiffPercent: 6,
};

function pendingRecord(overrides: Partial<UniverseVerificationRecord>): UniverseVerificationRecord {
  return {
    id: "2026-08-20-7203",
    schemaVersion: 1,
    source: "universe-225-snapshot",
    snapshotId: "2026-08-20-7203",
    date: "2026-08-20",
    code: "7203",
    companyName: "トヨタ自動車",
    signal: "買い",
    score: 85,
    confidence: 80,
    priceAtJudgment: 3000,
    entryPrice: 3000,
    stopLoss: 2920,
    takeProfit: 3200,
    entryBlockLevel: "none",
    riskLevel: "中",
    todayAction: "今すぐエントリー",
    strategyVersion: "strategy-a-standard@1",
    analyzedAt: "2026-08-20T08:30:00+09:00",
    scanStartedAt: "2026-08-20T08:29:30+09:00",
    scanCompletedAt: "2026-08-20T08:30:00+09:00",
    snapshotCapturedAt: "2026-08-20T08:33:00+09:00",
    indicatorValues: DUMMY_INDICATOR_VALUES,
    day1: null,
    day3: null,
    day5: null,
    outcome: "pending",
    createdAt: "2026-08-20T08:33:00+09:00",
    ...overrides,
  };
}

// 判定日2026-08-20（木）を基準に、土日（8/22,8/23）を挟んだ実際の営業日のみを含む
// 固定データ（Yahoo Financeのchart()が実際に返す「取引があった日のみ」を模したもの）。
// テストケース8/9/10/11/12: 1/3/5営業日後の正しい判定、土日・休場日を営業日として数えない
const BUSINESS_DAYS_ONLY_CLOSES = [
  { date: "2026-08-21", close: 3050 }, // 金（day1）
  // 8/22(土)・8/23(日)は休場のためデータ自体が存在しない
  { date: "2026-08-24", close: 3100 }, // 月
  { date: "2026-08-25", close: 3080 }, // 火（day3 = 3番目の営業日）
  { date: "2026-08-26", close: 3150 }, // 水
  { date: "2026-08-27", close: 3200 }, // 木（day5 = 5番目の営業日）
];

test("1/3/5営業日後を正しく判定する（土日はカウントしない）", async () => {
  await withTempDataDir(async () => {
    await writeUniverseVerificationLogRaw([pendingRecord({})]);

    const fakeProvider: FutureClosesProvider = async () => BUSINESS_DAYS_ONLY_CLOSES;
    const result = await settlePendingUniverseVerificationRecords(fakeProvider);
    assert.equal(result.processedCount, 1);
    assert.equal(result.updatedCount, 1);

    const [record] = await readUniverseVerificationLog();
    assert.equal(record!.day1!.date, "2026-08-21", "day1は土日を挟まない翌営業日");
    assert.equal(record!.day3!.date, "2026-08-25", "day3は3番目の営業日（土日はカウントしない）");
    assert.equal(record!.day5!.date, "2026-08-27", "day5は5番目の営業日");
    assert.equal(record!.day1!.changePercent, 1.7, "(3050-3000)/3000*100 = 1.666...% → 1.7%（既存丸め仕様と同じ）");
    assert.equal(record!.outcome, "win", "買い→day5で上昇（3000→3200）なので勝ち（既存resolveDirectionalOutcomeを再利用）");
  });
});

// テストケース14（SELL側）: SELLは下落で勝ち
test("SELLシグナルは下落した場合winになる（既存resolveDirectionalOutcomeを再利用）", async () => {
  await withTempDataDir(async () => {
    await writeUniverseVerificationLogRaw([pendingRecord({ signal: "売り", priceAtJudgment: 3000 })]);
    const fallingCloses = [
      { date: "2026-08-21", close: 2950 },
      { date: "2026-08-24", close: 2900 },
      { date: "2026-08-25", close: 2880 },
      { date: "2026-08-26", close: 2850 },
      { date: "2026-08-27", close: 2800 },
    ];
    const fakeProvider: FutureClosesProvider = async () => fallingCloses;
    await settlePendingUniverseVerificationRecords(fakeProvider);
    const [record] = await readUniverseVerificationLog();
    assert.equal(record!.outcome, "win", "売り→下落なので勝ち");
  });
});

// テストケース14（WAIT側）: WAITは二値化せず観測データとして保存する
test("WAITシグナルはoutcome=observedとなり、day1/3/5の生データは保存される（二値化しない）", async () => {
  await withTempDataDir(async () => {
    await writeUniverseVerificationLogRaw([pendingRecord({ signal: "待ち" })]);
    const fakeProvider: FutureClosesProvider = async () => BUSINESS_DAYS_ONLY_CLOSES;
    await settlePendingUniverseVerificationRecords(fakeProvider);
    const [record] = await readUniverseVerificationLog();
    assert.equal(record!.outcome, "observed");
    assert.ok(record!.day1 && record!.day3 && record!.day5, "WAITでも価格追跡データ自体は保存される（後から「待つ判断が妥当だったか」を分析できるように）");
  });
});

// テストケース13: 価格データ欠損時に誤った結果を確定しない（fail-safe）
test("価格データが1件も取得できない場合、レコードはpendingのまま変更されない", async () => {
  await withTempDataDir(async () => {
    await writeUniverseVerificationLogRaw([pendingRecord({})]);
    const emptyProvider: FutureClosesProvider = async () => [];
    const result = await settlePendingUniverseVerificationRecords(emptyProvider);
    assert.equal(result.updatedCount, 0);

    const [record] = await readUniverseVerificationLog();
    assert.equal(record!.outcome, "pending", "誤った結果を確定させず、pendingのまま保持する");
    assert.equal(record!.day1, null);
  });
});

test("Yahoo Finance取得自体が例外を投げても他のレコード処理は継続する（fail-safe）", async () => {
  await withTempDataDir(async () => {
    await writeUniverseVerificationLogRaw([
      pendingRecord({ id: "2026-08-20-9999", code: "9999" }),
      pendingRecord({ id: "2026-08-20-7203", code: "7203" }),
    ]);
    const provider: FutureClosesProvider = async (code) => {
      if (code === "9999") throw new Error("上場廃止等でデータ取得失敗");
      return BUSINESS_DAYS_ONLY_CLOSES;
    };
    const result = await settlePendingUniverseVerificationRecords(provider);
    assert.equal(result.updatedCount, 1, "失敗した1件を除き、もう1件は正常に処理される");

    const records = await readUniverseVerificationLog();
    const failed = records.find((r) => r.code === "9999")!;
    const succeeded = records.find((r) => r.code === "7203")!;
    assert.equal(failed.outcome, "pending", "取得失敗レコードはpendingのまま");
    assert.equal(succeeded.outcome, "win");
  });
});

// テストケース15: strategyVersionを保持できる（settle前後で変化しないこと）
test("settle前後でstrategyVersionが保持される", async () => {
  await withTempDataDir(async () => {
    await writeUniverseVerificationLogRaw([pendingRecord({ strategyVersion: "strategy-a-standard@1" })]);
    const fakeProvider: FutureClosesProvider = async () => BUSINESS_DAYS_ONLY_CLOSES;
    await settlePendingUniverseVerificationRecords(fakeProvider);
    const [record] = await readUniverseVerificationLog();
    assert.equal(record!.strategyVersion, "strategy-a-standard@1");
  });
});

// テストケース18（settle側）: 既にoutcomeが確定したレコードを再度settleしても変化しない
test("既にwin/loss/observed確定済みのレコードを再度settleしても変化しない（二重更新されない）", async () => {
  await withTempDataDir(async () => {
    await writeUniverseVerificationLogRaw([pendingRecord({})]);
    const fakeProvider: FutureClosesProvider = async () => BUSINESS_DAYS_ONLY_CLOSES;

    const first = await settlePendingUniverseVerificationRecords(fakeProvider);
    assert.equal(first.updatedCount, 1);
    const afterFirst = await readUniverseVerificationLog();

    const second = await settlePendingUniverseVerificationRecords(fakeProvider);
    assert.equal(second.processedCount, 0, "outcomeが確定済みのレコードはpending対象から除外される");
    assert.equal(second.updatedCount, 0);
    const afterSecond = await readUniverseVerificationLog();
    assert.deepEqual(afterSecond, afterFirst, "内容が一切変化しない");
  });
});
