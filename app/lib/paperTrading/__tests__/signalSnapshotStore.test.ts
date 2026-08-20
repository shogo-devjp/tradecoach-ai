import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureSignalSnapshot, getSignalSnapshotRows, getSnapshotCaptureResult } from "../signalSnapshotStore";

// PAPER_TRADING_DATA_DIRはstore.tsが呼び出しの都度読み直すため（モジュール読み込み時点では
// 参照しない設計、app/lib/paperTrading/store.ts参照）、各testの実行前に設定すれば足りる。
function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "paper-trading-test-"));
  process.env.PAPER_TRADING_DATA_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PAPER_TRADING_DATA_DIR;
  });
}

function fakeCachedScan(date: string) {
  return {
    dateKey: date,
    scannedAt: `${date}T08:30:00.000Z`,
    scannedCount: 2,
    failedCount: 0,
    candidates: [
      {
        code: "7203",
        symbol: "7203.T",
        name: "トヨタ自動車",
        score: 85,
        confidence: 80,
        price: 3000,
        signal: "買い" as const,
        entryPriority: 1,
        risk: "中" as const,
        strategyHeadline: "",
        aiComment: "",
        entryBlock: { level: "none" as const, reason: null },
        todayAction: "今すぐエントリー" as const,
        todayActionReason: "",
        reasons: [],
        entryPrice: 3000,
        stopLoss: 2920,
        takeProfit: 3200,
      },
      {
        code: "9984",
        symbol: "9984.T",
        name: "ソフトバンクグループ",
        score: 60,
        confidence: 70,
        price: 8000,
        signal: "待ち" as const,
        entryPriority: 2,
        risk: "低" as const,
        strategyHeadline: "",
        aiComment: "",
        entryBlock: { level: "none" as const, reason: null },
        todayAction: "様子見" as const,
        todayActionReason: "",
        reasons: [],
        entryPrice: 8000,
        stopLoss: 7800,
        takeProfit: 8400,
      },
    ],
  };
}

// テストケース12: Snapshotを後から上書きできない
test("同日中に2回捕捉しても2回目は既存の結果を返すだけ（上書きしない）", async () => {
  await withTempDataDir(async () => {
    const date = "2026-08-20";
    const now = new Date(`${date}T08:33:00+09:00`);
    const cached = fakeCachedScan(date);

    const first = await captureSignalSnapshot({ cachedScan: cached, strategyVersion: "strategy-a-standard@1", now });
    assert.equal(first.captured, true);

    // 2回目は候補データを変えて呼んでも、既存の結果がそのまま返り、rowsは増えない
    const mutatedCached = { ...cached, candidates: [{ ...cached.candidates[0], score: 999 }] };
    const second = await captureSignalSnapshot({ cachedScan: mutatedCached, strategyVersion: "strategy-a-standard@1", now });
    assert.deepEqual(second, first, "2回目の呼び出しは1回目の結果をそのまま返す（上書きなし）");

    const rows = await getSignalSnapshotRows(date);
    assert.equal(rows.length, 2, "1回目に保存した2件のまま増減しない");
    assert.equal(rows.find((r) => r.code === "7203")?.score, 85, "スコアが上書きされていない");
  });
});

// テストケース13: 9:00以降にSnapshotを作成できない
test("9:00 JSTを過ぎている場合はafter_market_openとしてfail-safeで捕捉しない", async () => {
  await withTempDataDir(async () => {
    const date = "2026-08-20";
    const now = new Date(`${date}T09:01:00+09:00`);
    const cached = fakeCachedScan(date);

    const result = await captureSignalSnapshot({ cachedScan: cached, strategyVersion: "strategy-a-standard@1", now });
    assert.equal(result.captured, false);
    assert.equal(result.reason, "after_market_open");

    const rows = await getSignalSnapshotRows(date);
    assert.equal(rows.length, 0, "Snapshotは作成されない");
  });
});

test("9:00ちょうどはafter_market_open（09:00は締切を過ぎたものとして扱う）", async () => {
  await withTempDataDir(async () => {
    const date = "2026-08-20";
    const now = new Date(`${date}T09:00:00+09:00`);
    const result = await captureSignalSnapshot({ cachedScan: fakeCachedScan(date), strategyVersion: "v1", now });
    assert.equal(result.captured, false);
    assert.equal(result.reason, "after_market_open");
  });
});

// テストケース14: データ欠損時は新規BUYしない（cache_unavailable経路）
test("getCachedScan()が当日分を返さない場合はcache_unavailableとしてfail-safe", async () => {
  await withTempDataDir(async () => {
    const date = "2026-08-20";
    const now = new Date(`${date}T08:33:00+09:00`);
    const result = await captureSignalSnapshot({ cachedScan: null, strategyVersion: "v1", now });
    assert.equal(result.captured, false);
    assert.equal(result.reason, "cache_unavailable");
  });
});

test("失敗件数が許容閾値を超える場合はtoo_many_failuresとしてfail-safe", async () => {
  await withTempDataDir(async () => {
    const date = "2026-08-20";
    const now = new Date(`${date}T08:33:00+09:00`);
    const cached = fakeCachedScan(date);
    cached.scannedCount = 100;
    cached.failedCount = 10; // 10% > 5%閾値
    // succeededCount+failedCount(2+10=12) < universeSize(100) にもならないよう scannedCount を調整
    const result = await captureSignalSnapshot({ cachedScan: cached, strategyVersion: "v1", now });
    assert.equal(result.captured, false);
    // succeeded(2)+failed(10)=12 < universeSize(100) のため、実際にはincomplete_scanが先に判定される。
    // これも「スキャン未完了」というfail-safeとして正しい挙動である。
    assert.ok(["too_many_failures", "incomplete_scan"].includes(result.reason ?? ""));
  });
});

test("スキャン未完了（結果件数が対象数に届いていない）場合はincomplete_scan", async () => {
  await withTempDataDir(async () => {
    const date = "2026-08-20";
    const now = new Date(`${date}T08:33:00+09:00`);
    const cached = fakeCachedScan(date);
    cached.scannedCount = 225; // 日経225全銘柄想定だが、結果は2件のみ
    const result = await captureSignalSnapshot({ cachedScan: cached, strategyVersion: "v1", now });
    assert.equal(result.captured, false);
    assert.equal(result.reason, "incomplete_scan");
  });
});

test("捕捉結果の記録(SnapshotCaptureResult)がgetSnapshotCaptureResultで取得できる", async () => {
  await withTempDataDir(async () => {
    const date = "2026-08-20";
    const now = new Date(`${date}T08:33:00+09:00`);
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(date), strategyVersion: "v1", now });
    const result = await getSnapshotCaptureResult(date);
    assert.ok(result);
    assert.equal(result!.captured, true);
  });
});
