import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { STRATEGY_A_ID, STRATEGY_A_VERSION } from "@/app/lib/paperTrading/config";
import { writeJson as writePaperTradingJson } from "@/app/lib/paperTrading/store";
import {
  appendPortfolioSnapshot,
  appendRejectedEntries,
  appendTrade,
  buildOpenPosition,
  closePositionWith,
  getPortfolioHistory,
  savePortfolioState,
  savePosition,
} from "@/app/lib/paperTrading/portfolioManager";
import { captureSignalSnapshot, getSignalSnapshotRows } from "@/app/lib/paperTrading/signalSnapshotStore";
import type { PaperPortfolioSnapshot, PaperPosition } from "@/app/lib/paperTrading/types";
import type { ScreenedStock } from "@/app/lib/screening/types";

// 「AI資産運用50万円チャレンジ・YouTube記録基盤」の一気通貫テスト。
// Paper Trading本体（PaperPortfolioSnapshot・PaperPosition・PaperTrade・Signal Snapshot）を
// 実際のstore関数で3営業日分構築し、それをSSOTとしてChallenge Daily Record・Milestone・
// YouTube Reportが正しく「転記」できていることを検証する（独自の再計算をしていないことの確認）。
//
// Paper Trading本体（PAPER_TRADING_DATA_DIR）・Challenge記録レイヤー（CHALLENGE_DATA_DIR）を
// 隔離し、既存225銘柄Verification（UNIVERSE_VERIFICATION_DATA_DIR）・既存30銘柄Verification
// （VERIFICATION_DATA_DIR）にも一切触れないことを、それぞれ隔離ディレクトリを与えたうえで
// 空のままであることをもって確認する（テストケース29・30）。
function withIsolatedDirs<T>(fn: () => Promise<T>): Promise<T> {
  const paperDir = mkdtempSync(path.join(tmpdir(), "challenge-e2e-paper-"));
  const challengeDir = mkdtempSync(path.join(tmpdir(), "challenge-e2e-challenge-"));
  const universeDir = mkdtempSync(path.join(tmpdir(), "challenge-e2e-universe-"));
  const verificationDir = mkdtempSync(path.join(tmpdir(), "challenge-e2e-verification30-"));
  process.env.PAPER_TRADING_DATA_DIR = paperDir;
  process.env.CHALLENGE_DATA_DIR = challengeDir;
  process.env.UNIVERSE_VERIFICATION_DATA_DIR = universeDir;
  process.env.VERIFICATION_DATA_DIR = verificationDir;
  return fn().finally(() => {
    rmSync(paperDir, { recursive: true, force: true });
    rmSync(challengeDir, { recursive: true, force: true });
    rmSync(universeDir, { recursive: true, force: true });
    rmSync(verificationDir, { recursive: true, force: true });
    delete process.env.PAPER_TRADING_DATA_DIR;
    delete process.env.CHALLENGE_DATA_DIR;
    delete process.env.UNIVERSE_VERIFICATION_DATA_DIR;
    delete process.env.VERIFICATION_DATA_DIR;
  });
}

const DUMMY_INDICATOR_VALUES = {
  rsi: 55, macdLine: 1, macdSignal: 0.5, macdHistogram: 0.5,
  sma5: 100, sma25: 98, sma75: 95, ma5DiffPercent: 2, ma25DiffPercent: 4, ma75DiffPercent: 6,
};

function candidate(overrides: Partial<ScreenedStock>): ScreenedStock {
  return {
    code: "0000", symbol: "0000.T", name: "ダミー銘柄", score: 50, confidence: 50, price: 1000,
    signal: "待ち", entryPriority: 1, risk: "中", strategyHeadline: "", aiComment: "",
    entryBlock: { level: "none", reason: null }, todayAction: "様子見", todayActionReason: "", reasons: [],
    entryPrice: 1000, stopLoss: 950, takeProfit: 1100, indicatorValues: DUMMY_INDICATOR_VALUES,
    ...overrides,
  };
}

async function captureDaySnapshot(date: string, hhmm08: string, candidates: ScreenedStock[]) {
  const now = new Date(`${date}T${hhmm08}:00+09:00`);
  const result = await captureSignalSnapshot({
    cachedScan: {
      dateKey: date,
      scanStartedAt: `${date}T08:29:30.000Z`,
      scannedAt: `${date}T08:30:00.000Z`,
      scannedCount: candidates.length,
      failedCount: 0,
      candidates,
    },
    strategyVersion: STRATEGY_A_VERSION,
    now,
  });
  assert.equal(result.captured, true, `${date}のSnapshot捕捉に失敗した: ${result.reason}`);
  return result;
}

test("225銘柄検証・Paper Tradingを汚さず、Daily Record・Milestone・YouTube Reportが3営業日分正しく生成される", async () => {
  await withIsolatedDirs(async () => {
    // maxPositions=1にして「1位候補は買うが2位候補は最大保有数で見送り」を再現する（§3の検証用）。
    await writePaperTradingJson("config.json", {
      strategies: {
        [STRATEGY_A_ID]: {
          strategyId: STRATEGY_A_ID, initialCapital: 500_000, lotSize: 100, maxPositions: 1, riskPercent: 0.02,
          entrySlippageBps: 10, exitSlippageBps: 10, commissionPerTrade: 0, maxHoldingDays: 20,
          dailyLossLimitPercent: 0.03, maxDrawdownHaltPercent: 0.15, abnormalPriceChangePercent: 0.25,
          benchmarkSymbol: "^N225",
        },
      },
    });

    // ============================== Day1: 2026-08-20（木） ==============================
    const DAY1 = "2026-08-20";
    await captureDaySnapshot(DAY1, "08:35", [
      candidate({ code: "7203", name: "トヨタ自動車", score: 90, confidence: 85, price: 3000, signal: "買い", entryPrice: 3000, stopLoss: 2900, takeProfit: 3300 }),
      candidate({ code: "6758", name: "ソニーグループ", score: 70, confidence: 60, price: 2000, signal: "買い", entryPrice: 2000, stopLoss: 1950, takeProfit: 2200 }),
      candidate({ code: "9984", name: "ソフトバンクグループ", score: 50, confidence: 40, price: 8000, signal: "待ち" }),
    ]);
    const day1Rows = await getSignalSnapshotRows(DAY1);
    const snap7203Day1 = day1Rows.find((r) => r.code === "7203")!;

    const position7203: PaperPosition = buildOpenPosition({
      strategyId: STRATEGY_A_ID,
      code: "7203",
      name: "トヨタ自動車",
      date: DAY1,
      snapshotId: snap7203Day1.id,
      buyJudgedAt: snap7203Day1.analyzedAt,
      buySignalScore: snap7203Day1.score,
      buyReasons: ["score=90"],
      strategyVersion: STRATEGY_A_VERSION,
      shares: 100,
      entry: {
        judgmentAt: snap7203Day1.analyzedAt,
        plannedFillAt: `${DAY1}T09:00:00+09:00`,
        processedAt: `${DAY1}T16:35:00+09:00`,
        dayOpen: 3000,
        entrySlippageBps: 10,
        commission: 0,
        fillPrice: 3003,
        gapAdjusted: false,
        invalidatedByGap: false,
      },
      stopLoss: 2900,
      takeProfit: 3300,
      investedAmount: 300_300,
    });
    await savePosition(position7203);
    await appendRejectedEntries(STRATEGY_A_ID, DAY1, [{ code: "6758", reason: "max_positions_reached" }]);

    const day1Snapshot: PaperPortfolioSnapshot = {
      strategyId: STRATEGY_A_ID,
      date: DAY1,
      cash: 199_700,
      positionsValue: 301_000,
      totalAssets: 500_700,
      unrealizedPnl: 700,
      realizedPnlToday: 0,
      cumulativeRealizedPnl: 0,
      cumulativeReturnPercent: 0.1,
      benchmarkValue: 500_000,
      benchmarkReturnPercent: 0,
      drawdownPercent: 0,
      openPositionCount: 1,
      newBuyHalted: false,
    };
    await appendPortfolioSnapshot(day1Snapshot);
    await savePortfolioState({
      strategyId: STRATEGY_A_ID, cash: 199_700, cumulativeRealizedPnl: 0, peakTotalAssets: 500_700,
      lastRunDate: DAY1, lastSnapshotDate: DAY1,
    });

    // ============================== Day2: 2026-08-21（金） ==============================
    const DAY2 = "2026-08-21";
    await captureDaySnapshot(DAY2, "08:35", [
      candidate({ code: "7203", name: "トヨタ自動車", score: 60, confidence: 50, price: 3200, signal: "待ち" }),
      candidate({ code: "6758", name: "ソニーグループ", score: 55, confidence: 45, price: 2050, signal: "待ち" }),
      candidate({ code: "9984", name: "ソフトバンクグループ", score: 45, confidence: 40, price: 8100, signal: "待ち" }),
    ]);

    const { position: closed7203, trade: trade7203 } = closePositionWith(
      position7203,
      {
        reason: "take_profit",
        dayOpen: 3200,
        dayHigh: 3300,
        dayLow: 3190,
        dayClose: 3280,
        referencePrice: 3300,
        exitSlippageBps: 10,
        commission: 0,
        fillPrice: 3295,
        gapAdjusted: false,
        sameDayConflict: false,
        processedAt: `${DAY2}T16:35:00+09:00`,
      },
      1
    );
    await savePosition(closed7203);
    await appendTrade(trade7203);

    const day2Snapshot: PaperPortfolioSnapshot = {
      strategyId: STRATEGY_A_ID,
      date: DAY2,
      cash: 529_200,
      positionsValue: 0,
      totalAssets: 529_200,
      unrealizedPnl: 0,
      realizedPnlToday: 29_200,
      cumulativeRealizedPnl: 29_200,
      cumulativeReturnPercent: 5.8,
      benchmarkValue: 505_000,
      benchmarkReturnPercent: 1.0,
      drawdownPercent: 0,
      openPositionCount: 0,
      newBuyHalted: false,
    };
    await appendPortfolioSnapshot(day2Snapshot);
    await savePortfolioState({
      strategyId: STRATEGY_A_ID, cash: 529_200, cumulativeRealizedPnl: 29_200, peakTotalAssets: 529_200,
      lastRunDate: DAY2, lastSnapshotDate: DAY2,
    });

    // ============================== Day3: 2026-08-24（月・週末をまたぐ） ==============================
    const DAY3 = "2026-08-24";
    await captureDaySnapshot(DAY3, "08:35", [
      candidate({ code: "7203", name: "トヨタ自動車", score: 40, confidence: 30, price: 3260, signal: "待ち" }),
      candidate({ code: "6758", name: "ソニーグループ", score: 75, confidence: 65, price: 2000, signal: "買い", entryPrice: 2000, stopLoss: 1950, takeProfit: 2200 }),
      candidate({ code: "9984", name: "ソフトバンクグループ", score: 45, confidence: 35, price: 8050, signal: "待ち" }),
    ]);
    const day3Rows = await getSignalSnapshotRows(DAY3);
    const snap6758Day3 = day3Rows.find((r) => r.code === "6758")!;

    const position6758: PaperPosition = buildOpenPosition({
      strategyId: STRATEGY_A_ID,
      code: "6758",
      name: "ソニーグループ",
      date: DAY3,
      snapshotId: snap6758Day3.id,
      buyJudgedAt: snap6758Day3.analyzedAt,
      buySignalScore: snap6758Day3.score,
      buyReasons: ["score=75"],
      strategyVersion: STRATEGY_A_VERSION,
      shares: 100,
      entry: {
        judgmentAt: snap6758Day3.analyzedAt,
        plannedFillAt: `${DAY3}T09:00:00+09:00`,
        processedAt: `${DAY3}T16:35:00+09:00`,
        dayOpen: 2000,
        entrySlippageBps: 10,
        commission: 0,
        fillPrice: 2005,
        gapAdjusted: false,
        invalidatedByGap: false,
      },
      stopLoss: 1950,
      takeProfit: 2200,
      investedAmount: 200_500,
    });

    const { position: closed6758, trade: trade6758 } = closePositionWith(
      position6758,
      {
        reason: "stop_loss",
        dayOpen: 2000,
        dayHigh: 2010,
        dayLow: 1940,
        dayClose: 1950,
        referencePrice: 1950,
        exitSlippageBps: 10,
        commission: 0,
        fillPrice: 1945,
        gapAdjusted: false,
        sameDayConflict: false,
        processedAt: `${DAY3}T16:35:00+09:00`,
      },
      0
    );
    await savePosition(closed6758);
    await appendTrade(trade6758);

    const day3Snapshot: PaperPortfolioSnapshot = {
      strategyId: STRATEGY_A_ID,
      date: DAY3,
      cash: 523_200,
      positionsValue: 0,
      totalAssets: 523_200,
      unrealizedPnl: 0,
      realizedPnlToday: trade6758.realizedPnl,
      cumulativeRealizedPnl: 29_200 + trade6758.realizedPnl,
      cumulativeReturnPercent: 4.6,
      benchmarkValue: 507_000,
      benchmarkReturnPercent: 1.4,
      drawdownPercent: 1.1,
      openPositionCount: 0,
      newBuyHalted: false,
    };
    await appendPortfolioSnapshot(day3Snapshot);
    await savePortfolioState({
      strategyId: STRATEGY_A_ID, cash: 523_200, cumulativeRealizedPnl: day3Snapshot.cumulativeRealizedPnl,
      peakTotalAssets: 529_200, // Day2のピークを維持（Day3は下落）
      lastRunDate: DAY3, lastSnapshotDate: DAY3,
    });

    // ---- ここまででPaper Trading本体のSSOTを3営業日分構築完了。以降がChallenge層のテスト ----

    const history = await getPortfolioHistory(STRATEGY_A_ID);
    assert.equal(history.length, 3, "前提: PaperPortfolioSnapshotが3件揃っている");

    const { generateDailyRecordAndMilestones } = await import("../dailyOrchestration");

    // --- Day1 Daily Record ---
    const gen1 = await generateDailyRecordAndMilestones({ date: DAY1 });
    assert.equal(gen1.recordCreated, true);
    const r1 = gen1.record!;

    // テストケース3: 1営業日目のDaily Record生成
    assert.equal(r1.tradingDayNumber, 1);
    // テストケース4: totalAssetsがPaper Trading本体と完全一致
    assert.equal(r1.totalAssets, day1Snapshot.totalAssets);
    // テストケース5: cash/positionsValueが本体と一致
    assert.equal(r1.cash, day1Snapshot.cash);
    assert.equal(r1.positionsValue, day1Snapshot.positionsValue);
    // テストケース6: 累計損益計算（totalAssets - initialCapital）
    assert.equal(r1.cumulativePnl, 700);
    // テストケース7: daily PnL計算
    assert.equal(r1.dailyPnl, 700);
    // テストケース8: Return%計算
    assert.equal(r1.dailyReturnPercent, 0.1);
    assert.equal(r1.cumulativeReturnPercent, 0.1);
    // テストケース9: Drawdown計算
    assert.equal(r1.drawdownPercent, 0);
    // テストケース10: 最大Drawdown計算
    assert.equal(r1.maxDrawdownPercent, 0);
    // テストケース11: Benchmark比較
    assert.equal(r1.benchmarkCurrentValue, 500_000);
    assert.equal(r1.excessReturnPercentagePoints, 0.1);
    // テストケース12: BUY/SELL/WAIT件数取得
    assert.equal(r1.buySignalCount, 2);
    assert.equal(r1.sellSignalCount, 0);
    assert.equal(r1.waitSignalCount, 1);
    // テストケース13: Tradeデータ紐づけ（当日ENTRY）
    assert.equal(r1.entryCount, 1);
    assert.equal(r1.trades[0]!.code, "7203");
    assert.equal(r1.trades[0]!.positionId, position7203.id);
    // テストケース14: Snapshot ID紐づけ
    assert.equal(r1.trades[0]!.snapshotId, snap7203Day1.id);
    assert.equal(r1.morningSnapshotDate, DAY1);
    // テストケース15: Strategy Version保持
    assert.equal(r1.strategyVersion, STRATEGY_A_VERSION);
    assert.equal(r1.trades[0]!.strategyVersion, STRATEGY_A_VERSION);

    // §3: 選定理由の復元（1位は選定、2位は最大保有数のため見送り）
    const sel7203 = r1.selections.find((s) => s.code === "7203")!;
    const sel6758 = r1.selections.find((s) => s.code === "6758")!;
    assert.equal(sel7203.selectionRank, 1);
    assert.equal(sel7203.selectedForPaperTrading, true);
    assert.equal(sel7203.rejectionReason, null);
    assert.equal(sel6758.selectionRank, 2);
    assert.equal(sel6758.selectedForPaperTrading, false);
    assert.equal(sel6758.rejectionReason, "max_positions_reached");

    // テストケース16: Milestone初回記録
    assert.ok(gen1.newEvents.some((e) => e.eventType === "challenge_started"));
    assert.ok(gen1.newEvents.some((e) => e.eventType === "first_entry"));
    assert.ok(gen1.newEvents.some((e) => e.eventType === "new_equity_high"));

    // --- Day2 Daily Record ---
    const gen2 = await generateDailyRecordAndMilestones({ date: DAY2 });
    const r2 = gen2.record!;
    assert.equal(r2.tradingDayNumber, 2);
    assert.equal(r2.totalAssets, 529_200);
    assert.equal(r2.exitCount, 1);
    assert.equal(r2.entryCount, 0);
    const exitTrade = r2.trades.find((t) => t.side === "EXIT")!;
    assert.equal(exitTrade.code, "7203");
    assert.equal(exitTrade.realizedPnl, trade7203.realizedPnl);
    assert.equal(exitTrade.exitReason, "take_profit");
    assert.equal(exitTrade.snapshotId, snap7203Day1.id, "EXIT時もENTRY時と同じSnapshotIdを保持する");
    assert.equal(r2.winCount, 1);
    assert.equal(r2.lossCount, 0);
    assert.equal(r2.winRatePercent, 100);

    // テストケース20: 初利益/初損切り等のイベント判定（利益側）
    assert.ok(gen2.newEvents.some((e) => e.eventType === "first_exit"));
    assert.ok(gen2.newEvents.some((e) => e.eventType === "first_profit"));
    assert.ok(gen2.newEvents.some((e) => e.eventType === "first_take_profit"));
    // equity_milestone_up: 510,000円(+2%)・525,000円(+5%)の両方を超えている
    const upEvents = gen2.newEvents.filter((e) => e.eventType === "equity_milestone_up");
    assert.ok(upEvents.some((e) => e.eventData.thresholdPercent === 2));
    assert.ok(upEvents.some((e) => e.eventData.thresholdPercent === 5));

    // --- Day3 Daily Record ---
    const gen3 = await generateDailyRecordAndMilestones({ date: DAY3 });
    const r3 = gen3.record!;
    assert.equal(r3.tradingDayNumber, 3);
    assert.equal(r3.totalAssets, 523_200);
    assert.equal(r3.entryCount, 1);
    assert.equal(r3.exitCount, 1);
    assert.equal(r3.drawdownPercent, 1.1);
    assert.equal(r3.maxDrawdownPercent, 1.1, "3日分の履歴中の最大Drawdownを保持する");
    assert.equal(r3.winCount, 1);
    assert.equal(r3.lossCount, 1);
    assert.equal(r3.winRatePercent, 50);
    const sel6758Day3 = r3.selections.find((s) => s.code === "6758")!;
    assert.equal(sel6758Day3.selectedForPaperTrading, true);
    assert.equal(sel6758Day3.rejectionReason, null);

    // テストケース20: 初損切り
    assert.ok(gen3.newEvents.some((e) => e.eventType === "first_loss"));
    assert.ok(gen3.newEvents.some((e) => e.eventType === "first_stop_loss"));
    // テストケース19: new max drawdown判定
    assert.ok(gen3.newEvents.some((e) => e.eventType === "new_max_drawdown"));

    // テストケース27: 同一日のDaily Record再実行で二重生成しない
    const gen1Again = await generateDailyRecordAndMilestones({ date: DAY1 });
    assert.equal(gen1Again.recordCreated, false);
    assert.equal(gen1Again.reason, "already_exists");
    assert.equal(gen1Again.newEvents.length, 0);
    const { readDailyRecords, readEvents } = await import("../store");
    const allRecords = await readDailyRecords();
    assert.equal(allRecords.length, 3, "再実行してもDaily Record総数は増えない");
    const challengeStartedEvents = (await readEvents()).filter((e) => e.eventType === "challenge_started");
    assert.equal(challengeStartedEvents.length, 1, "challenge_startedは二重記録されない");

    // テストケース28: Challenge記録失敗でもPaper Trading本体データを破壊しない
    // （未来日=Paper Trading本体のPaperPortfolioSnapshotが存在しない日）に対してDaily Record
    // 生成を試みてもfail-safeで何も書き込まず、Paper Trading本体のデータは変化しない。
    const beforeTrades = await import("@/app/lib/paperTrading/portfolioManager").then((m) => m.getTrades(STRATEGY_A_ID));
    const futureGen = await generateDailyRecordAndMilestones({ date: "2026-09-01" });
    assert.equal(futureGen.recordCreated, false);
    assert.equal(futureGen.reason, "portfolio_snapshot_not_found");
    const afterTrades = await import("@/app/lib/paperTrading/portfolioManager").then((m) => m.getTrades(STRATEGY_A_ID));
    assert.deepEqual(afterTrades, beforeTrades, "Challenge記録の失敗でPaper Trading本体のtradesは変化しない");

    // テストケース23〜26: YouTube Report生成・Best/Worst Trade・資産推移series・Benchmark series
    const { buildYoutubeReport } = await import("../youtubeReport");
    const report = await buildYoutubeReport(DAY1, DAY3);

    assert.equal(report.tradingDayCount, 3);
    assert.equal(report.startingAssets, 500_000, "期間開始前のデータがないためinitialCapitalを基準にする");
    assert.equal(report.endingAssets, 523_200);
    assert.equal(report.pnl, 23_200);
    assert.equal(report.totalTrades, 2);
    assert.equal(report.winCount, 1);
    assert.equal(report.lossCount, 1);
    assert.equal(report.winRatePercent, 50);
    assert.equal(report.bestTrade!.code, "7203");
    assert.equal(report.bestTrade!.realizedPnl, trade7203.realizedPnl);
    assert.equal(report.worstTrade!.code, "6758");
    assert.equal(report.worstTrade!.realizedPnl, trade6758.realizedPnl);
    assert.equal(report.maxDrawdownPercent, 1.1);
    assert.equal(report.buySignalTotal, 3, "Day1:2件 + Day3:1件");
    assert.equal(report.entryTotal, 2);
    assert.equal(report.exitTotal, 2);
    assert.equal(report.equitySeries.length, 3);
    assert.equal(report.equitySeries[2]!.totalAssets, 523_200);
    assert.equal(report.benchmarkSeries.length, 3);
    assert.equal(report.benchmarkSeries[1]!.benchmarkValue, 505_000);
    assert.ok(report.milestones.length > 0, "期間中のMilestoneが含まれる");

    // テストケース29・30: 既存225銘柄Verification・既存30銘柄Verificationへ影響しない
    // （読み取りに使っていない独立ディレクトリのため、一切ファイルが作られていないはず）
    const { promises: fs } = await import("node:fs");
    const universeLog = path.join(process.env.UNIVERSE_VERIFICATION_DATA_DIR!, "log.json");
    const verification30Log = path.join(process.env.VERIFICATION_DATA_DIR!, "log.json");
    await assert.rejects(fs.access(universeLog), "225銘柄Verificationのログファイルは作られていない");
    await assert.rejects(fs.access(verification30Log), "既存30銘柄Verificationのログファイルは作られていない");
  });
});
