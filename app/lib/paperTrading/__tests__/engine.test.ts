import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureSignalSnapshot } from "../signalSnapshotStore";
import { runDaily, type DailyBarProvider } from "../engine";
import { getPortfolioState, getAllPositions, getTrades, getExecutionLog } from "../portfolioManager";
import { STRATEGY_A_ID } from "../config";
import type { DayBar } from "../exitResolver";

function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "paper-trading-test-"));
  process.env.PAPER_TRADING_DATA_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PAPER_TRADING_DATA_DIR;
  });
}

const DUMMY_INDICATOR_VALUES = {
  rsi: 55,
  macdLine: 1,
  macdSignal: 0.5,
  macdHistogram: 0.5,
  sma5: 100,
  sma25: 98,
  sma75: 95,
  ma5DiffPercent: 2,
  ma25DiffPercent: 4,
  ma75DiffPercent: 6,
};

function candidate(code: string, name: string, score: number, signal: "買い" | "売り" | "待ち", price: number, stopLoss: number, takeProfit: number) {
  return {
    code,
    symbol: `${code}.T`,
    name,
    score,
    confidence: 80,
    price,
    signal,
    entryPriority: 1,
    risk: "中" as const,
    strategyHeadline: "",
    aiComment: "",
    entryBlock: { level: "none" as const, reason: null },
    todayAction: "今すぐエントリー" as const,
    todayActionReason: "",
    reasons: [],
    entryPrice: price,
    stopLoss,
    takeProfit,
    indicatorValues: DUMMY_INDICATOR_VALUES,
  };
}

function fakeCachedScan(date: string, candidates: ReturnType<typeof candidate>[]) {
  return {
    dateKey: date,
    scanStartedAt: `${date}T08:29:30.000Z`,
    scannedAt: `${date}T08:30:00.000Z`,
    scannedCount: candidates.length,
    failedCount: 0,
    candidates,
  };
}

function makeBarProvider(bars: Record<string, DayBar>, previousCloses: Record<string, number> = {}): DailyBarProvider {
  return {
    async getBar(symbol) {
      return bars[symbol] ?? null;
    },
    async getPreviousClose(symbol) {
      return previousCloses[symbol] ?? null;
    },
  };
}

const DATE = "2026-08-20";

// テストケース1: 50万円から正常にPortfolioが開始される
test("初回runで50万円からPortfolioが開始される（保有0件・取引なしなら現金は初期資金のまま）", async () => {
  await withTempDataDir(async () => {
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, []), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const barProvider = makeBarProvider({ "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 } });
    const result = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:35:00+09:00`) });

    assert.equal(result.skipped, false);
    assert.equal(result.portfolioSnapshot!.cash, 500_000);
    assert.equal(result.portfolioSnapshot!.totalAssets, 500_000);
    assert.equal(result.portfolioSnapshot!.openPositionCount, 0);
    assert.equal(result.portfolioSnapshot!.cumulativeReturnPercent, 0);

    const state = await getPortfolioState(STRATEGY_A_ID, 500_000);
    assert.equal(state.cash, 500_000);
    assert.equal(state.lastRunDate, DATE);
  });
});

// テストケース5: ENTRY当日のSL
test("新規ENTRY当日にLowがSLへ到達した場合、同日中にEXITし1取引として記録される", async () => {
  await withTempDataDir(async () => {
    const cand = candidate("7203", "トヨタ自動車", 85, "買い", 3000, 2920, 3200);
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, [cand]), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const barProvider = makeBarProvider({
      "7203": { open: 3000, high: 3050, low: 2900, close: 2950 }, // Low(2900) <= SL(2920)
      "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 },
    });

    const result = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:35:00+09:00`) });

    assert.equal(result.newlyOpenedPositionIds.length, 1);
    assert.equal(result.exitedPositionIds.length, 1, "同日中にSLでEXITしている");
    assert.deepEqual(result.newlyOpenedPositionIds, result.exitedPositionIds, "新規に建てたポジションと同一IDがEXIT済み");

    const trades = await getTrades(STRATEGY_A_ID);
    assert.equal(trades.length, 1);
    assert.equal(trades[0]!.exitReason, "stop_loss");
    assert.equal(trades[0]!.holdingDays, 0, "保有日数0日の1取引として記録される");

    const positions = await getAllPositions(STRATEGY_A_ID);
    assert.equal(positions.length, 1);
    assert.equal(positions[0]!.status, "closed");
  });
});

// テストケース6（Engine統合）: BUY Snapshot → OpenでENTRY → 当日HighでTP到達 → 同日EXIT
// → trades / execution-log / cash / portfolioへ正常反映されるところまでを通しで確認する。
test("新規ENTRY当日にHighがTPへ到達した場合、同日中にTPでEXITしtrades/execution-log/cash/portfolioへ正しく反映される", async () => {
  await withTempDataDir(async () => {
    const cand = candidate("7203", "トヨタ自動車", 85, "買い", 3000, 2920, 3200);
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, [cand]), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const barProvider = makeBarProvider({
      "7203": { open: 3000, high: 3250, low: 2980, close: 3200 }, // High(3250) >= TP(3200)、Low(2980)はSL(2920)未到達
      "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 },
    });

    const result = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:35:00+09:00`) });

    // --- runDaily の戻り値 ---
    assert.equal(result.newlyOpenedPositionIds.length, 1);
    assert.equal(result.exitedPositionIds.length, 1, "同日中にTPでEXITしている");
    assert.deepEqual(result.newlyOpenedPositionIds, result.exitedPositionIds);
    assert.equal(result.rejectedEntries.length, 0);

    // --- trades.json ---
    const trades = await getTrades(STRATEGY_A_ID);
    assert.equal(trades.length, 1);
    assert.equal(trades[0]!.exitReason, "take_profit");
    assert.equal(trades[0]!.holdingDays, 0);
    assert.equal(trades[0]!.entryFillPrice, 3003, "Open(3000)×(1+10bps)");
    assert.equal(trades[0]!.exitFillPrice, 3196.8, "TP(3200)×(1-10bps)");
    assert.ok(trades[0]!.realizedPnl > 0, "TP到達なので利益が出ているはず");

    // --- execution-log.json ---
    const logs = await getExecutionLog(STRATEGY_A_ID);
    assert.equal(logs.length, 2, "ENTRY・EXITそれぞれ1件ずつ");
    const entryLog = logs.find((l) => l.side === "ENTRY");
    const exitLog = logs.find((l) => l.side === "EXIT");
    assert.ok(entryLog);
    assert.equal(entryLog!.reason, "buy_signal");
    assert.ok(exitLog);
    assert.equal(exitLog!.reason, "take_profit");
    assert.equal(exitLog!.referencePrice, 3200, "Gapしていないため指定TP価格そのものが基準");
    assert.equal(exitLog!.gapAdjusted, false);
    assert.equal(exitLog!.sameDayConflict, false);

    // --- positions.json（状態がclosedで残ること） ---
    const positions = await getAllPositions(STRATEGY_A_ID);
    assert.equal(positions.length, 1);
    assert.equal(positions[0]!.status, "closed");
    assert.equal(positions[0]!.exit!.reason, "take_profit");

    // --- portfolio（現金が実現益の分だけ増えていること） ---
    const state = await getPortfolioState(STRATEGY_A_ID, 500_000);
    assert.equal(state.cash, 500_000 + trades[0]!.realizedPnl);
    assert.ok(state.cumulativeRealizedPnl > 0);
    assert.equal(result.portfolioSnapshot!.cash, state.cash);
    assert.equal(result.portfolioSnapshot!.openPositionCount, 0);
  });
});

// テストケース7（Engine統合）: ENTRY当日にSL/TP双方へ到達した場合、既存ポジションと同じ
// 保守ルール（SL優先）がEngine全体を通しても適用されることを確認する。
test("新規ENTRY当日にSL/TP双方へ到達した場合、Engine全体を通してもSLが優先されて記録される", async () => {
  await withTempDataDir(async () => {
    const cand = candidate("7203", "トヨタ自動車", 85, "買い", 3000, 2920, 3200);
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, [cand]), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const barProvider = makeBarProvider({
      "7203": { open: 3000, high: 3250, low: 2900, close: 3050 }, // High(3250)>=TP(3200) かつ Low(2900)<=SL(2920)
      "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 },
    });

    const result = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:35:00+09:00`) });

    assert.equal(result.exitedPositionIds.length, 1);

    const trades = await getTrades(STRATEGY_A_ID);
    assert.equal(trades.length, 1);
    assert.equal(trades[0]!.exitReason, "stop_loss", "SL/TP同時到達時はSLが優先される");

    const logs = await getExecutionLog(STRATEGY_A_ID);
    const exitLog = logs.find((l) => l.side === "EXIT");
    assert.ok(exitLog);
    assert.equal(exitLog!.reason, "stop_loss");
    assert.equal(exitLog!.sameDayConflict, true, "同日競合フラグがexecution-logに記録される");
    assert.equal(exitLog!.referencePrice, 2920, "SL価格が基準");

    const positions = await getAllPositions(STRATEGY_A_ID);
    assert.equal(positions[0]!.exit!.sameDayConflict, true);
  });
});

// テストケース11: 同一runを2回実行しても二重約定しない
test("同一日のrunを2回実行しても、2回目はskipped:trueで何も変わらない", async () => {
  await withTempDataDir(async () => {
    const cand = candidate("7203", "トヨタ自動車", 85, "買い", 3000, 2920, 3200);
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, [cand]), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });
    const barProvider = makeBarProvider({
      "7203": { open: 3000, high: 3020, low: 2980, close: 3010 },
      "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 },
    });

    const first = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:35:00+09:00`) });
    assert.equal(first.skipped, false);
    assert.equal(first.newlyOpenedPositionIds.length, 1);

    const second = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:40:00+09:00`) });
    assert.equal(second.skipped, true);
    assert.equal(second.skipReason, "already_run_today");

    const positions = await getAllPositions(STRATEGY_A_ID);
    assert.equal(positions.length, 1, "2回実行しても1件のまま（二重約定していない）");
  });
});

// テストケース16: 複数BUY候補を逐次処理して合計現金を超えない
test("複数のBUY候補を逐次処理しても合計投資額が現金残高を超えない", async () => {
  await withTempDataDir(async () => {
    // 各候補は2%リスク予算により100株(約10万円強)に制限される想定。3件処理しても
    // 合計30万円強で現金50万円に収まるはずだが、逐次的に現金残高を正しく更新して
    // サイジングしていることを確認する（現金を先に丸ごと使い切って2件目以降が
    // 不当に拒否されたり、逆に現金チェックを飛ばして超過したりしないこと）。
    const candidates = [
      candidate("A001", "銘柄A", 90, "買い", 1000, 950, 1100),
      candidate("A002", "銘柄B", 85, "買い", 1000, 950, 1100),
      candidate("A003", "銘柄C", 80, "買い", 1000, 950, 1100),
    ];
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, candidates), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const bars: Record<string, DayBar> = { "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 } };
    for (const c of candidates) bars[c.code] = { open: 1000, high: 1010, low: 990, close: 1005 };
    const barProvider = makeBarProvider(bars);

    const result = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:35:00+09:00`) });

    const positions = await getAllPositions(STRATEGY_A_ID);
    const openPositions = positions.filter((p) => p.status === "open");
    const totalInvested = openPositions.reduce((sum, p) => sum + p.investedAmount, 0);

    assert.ok(totalInvested <= 500_000, `合計投資額(${totalInvested})は現金残高(500,000)を超えてはいけない`);
    assert.equal(openPositions.length, 3, "最大保有3銘柄まで許容され、3件とも約定できるはず");
    assert.equal(result.rejectedEntries.length, 0);

    const state = await getPortfolioState(STRATEGY_A_ID, 500_000);
    assert.ok(state.cash >= 0, "現金残高はマイナスにならない");
  });
});

// テストケース15（engineレベル）: 最大3銘柄制限（4件目は拒否される）
test("4銘柄目のBUY候補は最大保有数(3)により拒否される", async () => {
  await withTempDataDir(async () => {
    const candidates = [
      candidate("B001", "銘柄A", 95, "買い", 1000, 950, 1100),
      candidate("B002", "銘柄B", 90, "買い", 1000, 950, 1100),
      candidate("B003", "銘柄C", 85, "買い", 1000, 950, 1100),
      candidate("B004", "銘柄D", 80, "買い", 1000, 950, 1100),
    ];
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, candidates), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const bars: Record<string, DayBar> = { "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 } };
    for (const c of candidates) bars[c.code] = { open: 1000, high: 1010, low: 990, close: 1005 };
    const barProvider = makeBarProvider(bars);

    const result = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:35:00+09:00`) });

    assert.equal(result.newlyOpenedPositionIds.length, 3);
    assert.equal(result.rejectedEntries.length, 1);
    assert.equal(result.rejectedEntries[0]!.code, "B004");
    assert.equal(result.rejectedEntries[0]!.reason, "max_positions_reached");
  });
});

// テストケース14: データ欠損時は新規BUYしない
test("価格データが取得できない銘柄は新規BUYされない（fail-safe）", async () => {
  await withTempDataDir(async () => {
    const cand = candidate("9999", "データ欠損銘柄", 90, "買い", 3000, 2920, 3200);
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, [cand]), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const barProvider = makeBarProvider({ "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 } }); // 9999.Tのbarは提供しない(null)

    const result = await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: new Date(`${DATE}T16:35:00+09:00`) });

    assert.equal(result.newlyOpenedPositionIds.length, 0);
    assert.equal(result.rejectedEntries.length, 1);
    assert.equal(result.rejectedEntries[0]!.reason, "data_unavailable");
  });
});

// テストケース17: judgmentAt < plannedFillAt <= processedAt
test("すべてのポジションでjudgmentAt < plannedFillAt <= processedAtが成立する", async () => {
  await withTempDataDir(async () => {
    const cand = candidate("7203", "トヨタ自動車", 85, "買い", 3000, 2920, 3200);
    const analyzedAtIso = `${DATE}T08:30:00+09:00`; // 当日08:30 JST（=前日23:30 UTC）
    await captureSignalSnapshot({
      cachedScan: { ...fakeCachedScan(DATE, [cand]), scannedAt: analyzedAtIso },
      strategyVersion: "v1",
      now: new Date(`${DATE}T08:33:00+09:00`),
    });

    const barProvider = makeBarProvider({
      "7203": { open: 3000, high: 3020, low: 2980, close: 3010 },
      "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 },
    });
    const processedAtDate = new Date(`${DATE}T16:35:00+09:00`);
    await runDaily({ strategyId: STRATEGY_A_ID, date: DATE, barProvider, benchmarkBarProvider: barProvider, now: processedAtDate });

    const [position] = await getAllPositions(STRATEGY_A_ID);
    assert.ok(position);
    const judgmentAt = new Date(position!.entry.judgmentAt).getTime();
    const plannedFillAt = new Date(position!.entry.plannedFillAt).getTime();
    const processedAt = new Date(position!.entry.processedAt).getTime();

    assert.ok(judgmentAt < plannedFillAt, `judgmentAt(${position!.entry.judgmentAt}) < plannedFillAt(${position!.entry.plannedFillAt})`);
    assert.ok(plannedFillAt <= processedAt, `plannedFillAt(${position!.entry.plannedFillAt}) <= processedAt(${position!.entry.processedAt})`);
  });
});

// テストケース18（部分）: Paper Tradingのデータ保存先がverificationとは完全に分離されている
test("Paper Tradingのデータ保存先はverification/data/log.jsonとは異なるディレクトリである", async () => {
  await withTempDataDir(async () => {
    const { dataDir } = await import("../store");
    const paperDir = dataDir();
    const verificationDir = path.join(process.cwd(), "app/lib/verification/data");
    assert.notEqual(paperDir, verificationDir);
    assert.ok(!paperDir.includes("verification"), "Paper Tradingの保存先パスに'verification'を含まない");
  });
});
