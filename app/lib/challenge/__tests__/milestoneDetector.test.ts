import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ChallengeDailyRecord } from "../types";
import type { PaperTrade } from "@/app/lib/paperTrading/types";

function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "challenge-milestone-test-"));
  process.env.CHALLENGE_DATA_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CHALLENGE_DATA_DIR;
  });
}

function fakeRecord(overrides: Partial<ChallengeDailyRecord>): ChallengeDailyRecord {
  return {
    challengeId: "ai-500k-challenge-strategy-a-standard-paper",
    date: "2026-08-20",
    tradingDayNumber: 1,
    strategyVersion: "strategy-a-standard@1",
    marketSessionStatus: "trading_day",
    initialCapital: 500_000,
    cash: 500_000,
    positionsValue: 0,
    totalAssets: 500_000,
    dailyPnl: 0,
    dailyReturnPercent: 0,
    cumulativePnl: 0,
    cumulativeReturnPercent: 0,
    peakTotalAssets: 500_000,
    drawdownPercent: 0,
    maxDrawdownPercent: 0,
    benchmarkStartValue: 500_000,
    benchmarkCurrentValue: 500_000,
    benchmarkCumulativeReturnPercent: 0,
    excessReturnPercentagePoints: 0,
    benchmarkMethod: "price_return",
    benchmarkVersion: 1,
    universeSize: 225,
    buySignalCount: 0,
    sellSignalCount: 0,
    waitSignalCount: 225,
    morningSnapshotDate: "2026-08-20",
    scanStartedAt: "2026-08-20T08:29:30.000Z",
    scanCompletedAt: "2026-08-20T08:30:00.000Z",
    snapshotCapturedAt: "2026-08-20T08:33:00.000Z",
    entryCount: 0,
    exitCount: 0,
    openPositionCount: 0,
    realizedPnlToday: 0,
    cumulativeRealizedPnl: 0,
    winCount: 0,
    lossCount: 0,
    winRatePercent: null,
    profitFactor: null,
    trades: [],
    selections: [],
    dailyDividendIncome: 0,
    cumulativeDividendIncome: 0,
    sourceRefs: { portfolioSnapshotDate: "2026-08-20", tradeIds: [], positionIds: [] },
    generatedAt: "2026-08-20T07:35:00.000Z",
    ...overrides,
  };
}

function fakeTrade(overrides: Partial<PaperTrade>): PaperTrade {
  return {
    id: "trade-1",
    strategyId: "strategy-a-standard",
    code: "7203",
    name: "トヨタ自動車",
    shares: 100,
    entryFillPrice: 3000,
    exitFillPrice: 3100,
    entryAt: "2026-08-20T09:00:00+09:00",
    exitAt: "2026-08-20T16:35:00+09:00",
    holdingDays: 0,
    exitReason: "take_profit",
    realizedPnl: 10000,
    realizedPnlPercent: 3.3,
    commissionTotal: 0,
    ...overrides,
  };
}

// テストケース21: 30営業日等の節目判定
test("運用10営業日目にtrading_day_milestoneが記録される", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const record = fakeRecord({ tradingDayNumber: 10 });
    const events = await detectAndRecordMilestones({ record, previousRecords: [], cumulativeTradesOrderedAsc: [] });
    const milestone = events.find((e) => e.eventType === "trading_day_milestone");
    assert.ok(milestone, "10営業日目でtrading_day_milestoneが記録される");
    assert.equal(milestone!.eventData.tradingDayNumber, 10);
  });
});

test("運用11営業日目（節目ではない）ではtrading_day_milestoneが記録されない", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const record = fakeRecord({ tradingDayNumber: 11 });
    const events = await detectAndRecordMilestones({ record, previousRecords: [], cumulativeTradesOrderedAsc: [] });
    assert.ok(!events.some((e) => e.eventType === "trading_day_milestone"));
  });
});

// テストケース18: new equity high判定
test("資産が過去の最高値を更新した場合new_equity_highが記録される", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const previousRecords = [fakeRecord({ date: "2026-08-20", totalAssets: 505_000, peakTotalAssets: 505_000 })];
    const record = fakeRecord({ date: "2026-08-21", tradingDayNumber: 2, totalAssets: 510_000, peakTotalAssets: 510_000 });
    const events = await detectAndRecordMilestones({ record, previousRecords, cumulativeTradesOrderedAsc: [] });
    assert.ok(events.some((e) => e.eventType === "new_equity_high"));
  });
});

test("資産が過去の最高値を更新していない場合new_equity_highは記録されない", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const previousRecords = [fakeRecord({ date: "2026-08-20", totalAssets: 510_000, peakTotalAssets: 510_000 })];
    const record = fakeRecord({ date: "2026-08-21", tradingDayNumber: 2, totalAssets: 505_000, peakTotalAssets: 510_000 });
    const events = await detectAndRecordMilestones({ record, previousRecords, cumulativeTradesOrderedAsc: [] });
    assert.ok(!events.some((e) => e.eventType === "new_equity_high"));
  });
});

// テストケース19: new max drawdown判定
test("最大Drawdownが過去最大を更新した場合new_max_drawdownが記録される", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const previousRecords = [fakeRecord({ date: "2026-08-20", maxDrawdownPercent: 1.0 })];
    const record = fakeRecord({ date: "2026-08-21", tradingDayNumber: 2, maxDrawdownPercent: 2.5 });
    const events = await detectAndRecordMilestones({ record, previousRecords, cumulativeTradesOrderedAsc: [] });
    assert.ok(events.some((e) => e.eventType === "new_max_drawdown"));
  });
});

// テストケース20: 初利益/初損切り等のイベント判定
test("初めての利益確定でfirst_profitが記録される", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const winTrade = fakeTrade({ realizedPnl: 5000, exitReason: "take_profit" });
    const record = fakeRecord({ exitCount: 1 });
    const events = await detectAndRecordMilestones({ record, previousRecords: [], cumulativeTradesOrderedAsc: [winTrade] });
    assert.ok(events.some((e) => e.eventType === "first_profit"));
    assert.ok(events.some((e) => e.eventType === "first_take_profit"));
    assert.ok(!events.some((e) => e.eventType === "first_loss"));
  });
});

test("初めての損切りでfirst_lossとfirst_stop_lossが記録される", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const lossTrade = fakeTrade({ id: "trade-2", realizedPnl: -3000, exitReason: "stop_loss" });
    const record = fakeRecord({ exitCount: 1 });
    const events = await detectAndRecordMilestones({ record, previousRecords: [], cumulativeTradesOrderedAsc: [lossTrade] });
    assert.ok(events.some((e) => e.eventType === "first_loss"));
    assert.ok(events.some((e) => e.eventType === "first_stop_loss"));
  });
});

// テストケース17: 同じMilestoneを二重記録しない
test("同じ条件で2回detectAndRecordMilestones()を呼んでも二重記録されない", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const record = fakeRecord({ tradingDayNumber: 10, totalAssets: 510_000, peakTotalAssets: 510_000 });

    const first = await detectAndRecordMilestones({ record, previousRecords: [], cumulativeTradesOrderedAsc: [] });
    const second = await detectAndRecordMilestones({ record, previousRecords: [], cumulativeTradesOrderedAsc: [] });

    assert.ok(first.length > 0, "1回目は複数のイベントが新規記録される");
    assert.equal(second.length, 0, "2回目は同一条件のため新規記録は0件");

    const { readEvents } = await import("../store");
    const all = await readEvents();
    const tradingDayEvents = all.filter((e) => e.eventType === "trading_day_milestone");
    assert.equal(tradingDayEvents.length, 1, "trading_day_milestoneは1件のみ（二重記録されない）");
  });
});

// 資産の節目（equity_milestone_up/down）
test("資産が+2%の節目（510,000円）を超えるとequity_milestone_upが記録される", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const record = fakeRecord({ totalAssets: 511_000 });
    const events = await detectAndRecordMilestones({ record, previousRecords: [], cumulativeTradesOrderedAsc: [] });
    const e = events.find((ev) => ev.eventType === "equity_milestone_up" && ev.eventData.thresholdPercent === 2);
    assert.ok(e, "510,000円（+2%）の節目が記録される");
  });
});

test("資産が-10%の節目（450,000円）を下回るとequity_milestone_downが記録される", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const record = fakeRecord({ totalAssets: 449_000 });
    const events = await detectAndRecordMilestones({ record, previousRecords: [], cumulativeTradesOrderedAsc: [] });
    const e = events.find((ev) => ev.eventType === "equity_milestone_down" && ev.eventData.thresholdPercent === 10);
    assert.ok(e, "450,000円（-10%）の節目が記録される");
  });
});

test("日経225を初めて上回るとbenchmark_cross_aboveが一度だけ記録される", async () => {
  await withTempDataDir(async () => {
    const { detectAndRecordMilestones } = await import("../milestoneDetector");
    const record1 = fakeRecord({ date: "2026-08-20", cumulativeReturnPercent: 1.0, benchmarkCumulativeReturnPercent: 0.5 });
    const events1 = await detectAndRecordMilestones({ record: record1, previousRecords: [], cumulativeTradesOrderedAsc: [] });
    assert.ok(events1.some((e) => e.eventType === "benchmark_cross_above"));

    const record2 = fakeRecord({ date: "2026-08-21", tradingDayNumber: 2, cumulativeReturnPercent: 1.5, benchmarkCumulativeReturnPercent: 0.8 });
    const events2 = await detectAndRecordMilestones({ record: record2, previousRecords: [record1], cumulativeTradesOrderedAsc: [] });
    assert.ok(!events2.some((e) => e.eventType === "benchmark_cross_above"), "2回目は既に記録済みのため二重記録されない");
  });
});
