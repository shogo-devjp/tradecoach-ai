import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, chmodSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { captureSignalSnapshot } from "@/app/lib/paperTrading/signalSnapshotStore";
import { getAllPositions, getPortfolioHistory, getTrades } from "@/app/lib/paperTrading/portfolioManager";
import type { DailyBarProvider } from "@/app/lib/paperTrading/engine";
import type { DayBar } from "@/app/lib/paperTrading/exitResolver";
import { writeUniverseVerificationLogRaw, readUniverseVerificationLog } from "@/app/lib/universeVerification/store";
import type { UniverseVerificationRecord } from "@/app/lib/universeVerification/types";

function withIsolatedDirs<T>(fn: () => Promise<T>): Promise<T> {
  const paperDir = mkdtempSync(path.join(tmpdir(), "evening-orch-paper-"));
  const challengeDir = mkdtempSync(path.join(tmpdir(), "evening-orch-challenge-"));
  const universeDir = mkdtempSync(path.join(tmpdir(), "evening-orch-universe-"));
  process.env.PAPER_TRADING_DATA_DIR = paperDir;
  process.env.CHALLENGE_DATA_DIR = challengeDir;
  process.env.UNIVERSE_VERIFICATION_DATA_DIR = universeDir;
  return fn().finally(() => {
    // chmodで書き込み不可にしたディレクトリが残っている可能性があるため、削除前に必ず復元する。
    for (const dir of [paperDir, challengeDir, universeDir]) {
      try {
        chmodSync(dir, 0o755);
      } catch {
        /* noop */
      }
    }
    rmSync(paperDir, { recursive: true, force: true });
    rmSync(challengeDir, { recursive: true, force: true });
    rmSync(universeDir, { recursive: true, force: true });
    delete process.env.PAPER_TRADING_DATA_DIR;
    delete process.env.CHALLENGE_DATA_DIR;
    delete process.env.UNIVERSE_VERIFICATION_DATA_DIR;
  });
}

const DUMMY_INDICATOR_VALUES = {
  rsi: 55, macdLine: 1, macdSignal: 0.5, macdHistogram: 0.5,
  sma5: 100, sma25: 98, sma75: 95, ma5DiffPercent: 2, ma25DiffPercent: 4, ma75DiffPercent: 6,
};

function candidate(code: string, name: string, score: number, price: number, stopLoss: number, takeProfit: number) {
  return {
    code, symbol: `${code}.T`, name, score, confidence: 80, price, signal: "買い" as const, entryPriority: 1,
    risk: "中" as const, strategyHeadline: "", aiComment: "", entryBlock: { level: "none" as const, reason: null },
    todayAction: "今すぐエントリー" as const, todayActionReason: "", reasons: [],
    entryPrice: price, stopLoss, takeProfit, indicatorValues: DUMMY_INDICATOR_VALUES,
  };
}

function fakeCachedScan(date: string, candidates: ReturnType<typeof candidate>[]) {
  return {
    dateKey: date, scanStartedAt: `${date}T08:29:30.000Z`, scannedAt: `${date}T08:30:00.000Z`,
    scannedCount: candidates.length, failedCount: 0, candidates,
  };
}

function makeBarProvider(bars: Record<string, DayBar>): DailyBarProvider {
  return {
    async getBar(symbol) {
      return bars[symbol] ?? null;
    },
    async getPreviousClose() {
      return null;
    },
  };
}

const DATE = "2026-08-20";

// テストケース5・6: 夕方統合処理の正常系（Paper Trading成功→Verification成功→Challenge成功）
test("正常系：①Paper Trading run→②Verification settle→③Daily Record→④Milestoneまで全段成功する", async () => {
  await withIsolatedDirs(async () => {
    const cand = candidate("7203", "トヨタ自動車", 85, 3000, 2920, 3300);
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, [cand]), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const barProvider = makeBarProvider({
      "7203": { open: 3000, high: 3350, low: 2990, close: 3300 }, // High >= TP(3300) → 同日EXITで利益確定
      "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 },
    });

    const { runEveningOrchestration } = await import("../eveningOrchestration");
    const result = await runEveningOrchestration({
      date: DATE,
      now: new Date(`${DATE}T16:35:00+09:00`),
      barProvider,
      benchmarkBarProvider: barProvider,
      closesProvider: async () => [],
    });

    assert.equal(result.record.successStep, "milestones");
    assert.equal(result.record.failedStep, null);
    assert.equal(result.record.errorReason, null);
    assert.ok(result.record.paperTradingCompletedAt);
    assert.ok(result.record.verificationSettledAt);
    assert.ok(result.record.dailyRecordGeneratedAt);
    assert.ok(result.record.milestonesProcessedAt);

    // Paper Trading本体に実際に取引が記録されている
    const trades = await getTrades(STRATEGY_A_ID);
    assert.equal(trades.length, 1);
    assert.equal(trades[0]!.realizedPnl > 0, true);

    // Challenge Daily Record・Milestoneも生成されている
    const { readDailyRecords, readEvents } = await import("../store");
    const records = await readDailyRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0]!.totalAssets, (await getPortfolioHistory(STRATEGY_A_ID))[0]!.totalAssets);
    const events = await readEvents();
    assert.ok(events.some((e) => e.eventType === "challenge_started"));
    assert.ok(events.some((e) => e.eventType === "first_profit"));
  });
});

// テストケース7・8・9・10・11・13: Challenge書き込み失敗時にPaper Trading本体は無傷のまま残り、
// 復旧後にDaily Recordだけ再生成できる。また同日再実行で二重取引・二重Daily Record・
// 二重Milestoneが発生しない。エラー箇所（failedStep/errorReason）がログから特定できる。
test("Challenge記録の書き込み失敗はPaper Trading本体を破壊せず、復旧後にDaily Recordだけ再生成でき、同日再実行しても二重化しない", async () => {
  await withIsolatedDirs(async () => {
    const cand = candidate("7203", "トヨタ自動車", 85, 3000, 2920, 3300);
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, [cand]), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const barProvider = makeBarProvider({
      "7203": { open: 3000, high: 3350, low: 2990, close: 3300 },
      "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 },
    });

    const challengeDir = process.env.CHALLENGE_DATA_DIR!;
    // ③（Challenge Daily Record書き込み）だけを失敗させるため、①②のPaper Trading/Verification
    // データディレクトリはそのまま書き込み可能にしつつ、Challengeディレクトリのみ書き込み不可にする。
    // 診断ログ（evening-orchestration-log.json）自体は「既存ファイルの上書き」であればディレクトリの
    // 書き込み権限がなくても成功する（POSIXでは新規作成・削除にのみディレクトリの書き込み権限が要る）
    // ため、あらかじめ空配列で作成しておいてからディレクトリを読み取り専用にする
    // （＝daily-records.jsonという「新規ファイル」の作成だけが失敗する状況を再現する）。
    writeFileSync(path.join(challengeDir, "evening-orchestration-log.json"), "[]", "utf-8");
    chmodSync(challengeDir, 0o555);

    const { runEveningOrchestration } = await import("../eveningOrchestration");
    const result1 = await runEveningOrchestration({
      date: DATE,
      now: new Date(`${DATE}T16:35:00+09:00`),
      barProvider,
      benchmarkBarProvider: barProvider,
      closesProvider: async () => [],
    });

    // テストケース13: エラー箇所がログから特定できる
    assert.equal(result1.record.successStep, "verification_settle", "①②までは成功、③で失敗");
    assert.equal(result1.record.failedStep, "challenge_daily_record");
    assert.ok(result1.record.errorReason, "エラー理由が記録されている");
    assert.ok(result1.record.paperTradingCompletedAt);
    assert.ok(result1.record.verificationSettledAt);
    assert.equal(result1.record.dailyRecordGeneratedAt, null);
    assert.equal(result1.record.milestonesProcessedAt, null);

    // テストケース7: Paper Trading確定データ（取引・ポジション・Portfolio履歴）は無傷で残っている
    const tradesAfterFailure = await getTrades(STRATEGY_A_ID);
    const positionsAfterFailure = await getAllPositions(STRATEGY_A_ID);
    const historyAfterFailure = await getPortfolioHistory(STRATEGY_A_ID);
    assert.equal(tradesAfterFailure.length, 1);
    assert.equal(tradesAfterFailure[0]!.realizedPnl > 0, true);
    assert.equal(positionsAfterFailure.length, 1);
    assert.equal(positionsAfterFailure[0]!.status, "closed");
    assert.equal(historyAfterFailure.length, 1);
    assert.equal(historyAfterFailure[0]!.date, DATE);

    // エラーログを見て復旧できるようにディレクトリを書き込み可能へ戻す
    chmodSync(challengeDir, 0o755);

    // テストケース8: Daily Recordだけを個別に再生成できる
    // （本番運用では POST /api/v1/challenge/daily-record を後から個別に叩くのと同じ経路）
    const { generateDailyRecordAndMilestones } = await import("../dailyOrchestration");
    const recovered = await generateDailyRecordAndMilestones({ date: DATE });
    assert.equal(recovered.recordCreated, true);
    assert.equal(recovered.record!.totalAssets, historyAfterFailure[0]!.totalAssets, "Paper Trading確定データと完全一致");

    // テストケース9・10・11: 同日再実行しても二重取引・二重Daily Record・二重Milestoneが発生しない
    const result2 = await runEveningOrchestration({
      date: DATE,
      now: new Date(`${DATE}T17:00:00+09:00`),
      barProvider,
      benchmarkBarProvider: barProvider,
      closesProvider: async () => [],
    });
    assert.equal(result2.record.successStep, "milestones", "復旧後の再実行は全段成功する");
    assert.equal(result2.record.failedStep, null);

    const tradesAfterRerun = await getTrades(STRATEGY_A_ID);
    assert.equal(tradesAfterRerun.length, 1, "同日再実行しても二重取引しない（runDaily自体の冪等性）");

    const { readDailyRecords, readEvents } = await import("../store");
    const recordsAfterRerun = await readDailyRecords();
    assert.equal(recordsAfterRerun.length, 1, "同日再実行しても二重Daily Recordしない");

    const challengeStartedEvents = (await readEvents()).filter((e) => e.eventType === "challenge_started");
    assert.equal(challengeStartedEvents.length, 1, "同日再実行しても二重Milestoneしない");
  });
});

// テストケース12: Verification settle失敗時の挙動
test("Verification settleの書き込みに失敗した場合、③④は実行されずfailedStepとして記録され、Paper Trading確定データは無傷のまま残る", async () => {
  await withIsolatedDirs(async () => {
    // このテストではPaper Trading側にBUYシグナルを与えず、①は「取引なし」で成功させる
    // （settle失敗の影響範囲だけを切り分けるための最小構成）。
    await captureSignalSnapshot({ cachedScan: fakeCachedScan(DATE, []), strategyVersion: "v1", now: new Date(`${DATE}T08:33:00+09:00`) });

    const seedRecord: UniverseVerificationRecord = {
      id: `${DATE}-7203`, schemaVersion: 1, source: "universe-225-snapshot", snapshotId: `${DATE}-7203`,
      date: DATE, code: "7203", companyName: "トヨタ自動車", signal: "買い", score: 85, confidence: 80,
      priceAtJudgment: 3000, entryPrice: 3000, stopLoss: 2920, takeProfit: 3300, entryBlockLevel: "none",
      riskLevel: "中", todayAction: "今すぐエントリー", strategyVersion: "v1", analyzedAt: `${DATE}T08:30:00.000Z`,
      scanStartedAt: `${DATE}T08:29:30.000Z`, scanCompletedAt: `${DATE}T08:30:00.000Z`, snapshotCapturedAt: `${DATE}T08:33:00.000Z`,
      indicatorValues: DUMMY_INDICATOR_VALUES, day1: null, day3: null, day5: null, outcome: "pending", createdAt: `${DATE}T08:33:00.000Z`,
    };
    await writeUniverseVerificationLogRaw([seedRecord]);

    const universeDir = process.env.UNIVERSE_VERIFICATION_DATA_DIR!;
    // 既存ファイル（log.json）の上書きを失敗させるには、ディレクトリではなくファイル自体の
    // 書き込み権限を落とす必要がある（POSIXでは既存ファイルの上書きはファイル自体の書き込み権限で
    // 判定され、ディレクトリの書き込み権限は新規作成・削除・rename時のみ必要となるため）。
    const universeLogFile = path.join(universeDir, "log.json");
    chmodSync(universeLogFile, 0o444); // ②の書き込みだけを失敗させる

    const barProvider = makeBarProvider({ "^N225": { open: 39000, high: 39200, low: 38900, close: 39100 } });

    const { runEveningOrchestration } = await import("../eveningOrchestration");
    const result = await runEveningOrchestration({
      date: DATE,
      now: new Date(`${DATE}T16:35:00+09:00`),
      barProvider,
      benchmarkBarProvider: barProvider,
      // day5まで到達する十分な数の終値を返し、settle内部で実際に書き込みが発生するようにする
      closesProvider: async () => [
        { date: "2026-08-21", close: 3100 },
        { date: "2026-08-24", close: 3150 },
        { date: "2026-08-25", close: 3200 },
        { date: "2026-08-26", close: 3250 },
        { date: "2026-08-27", close: 3300 },
      ],
    });

    assert.equal(result.record.successStep, "paper_trading_run", "①のみ成功、②で失敗");
    assert.equal(result.record.failedStep, "verification_settle");
    assert.ok(result.record.errorReason);
    assert.equal(result.record.dailyRecordGeneratedAt, null, "②が失敗したため③④は実行されない");
    assert.equal(result.record.milestonesProcessedAt, null);

    chmodSync(universeLogFile, 0o644);
    // Universe Verificationのレコード自体は書き込み失敗のため更新されておらずpendingのまま残る
    // （誤った中途半端な状態で確定していない）ことを確認する。
    const uvLog = await readUniverseVerificationLog();
    assert.equal(uvLog[0]!.outcome, "pending");

    // Paper Trading側（①）は②の失敗と無関係に正常完了している
    const state = readFileSync(path.join(process.env.PAPER_TRADING_DATA_DIR!, "portfolio-state.json"), "utf-8");
    assert.ok(JSON.parse(state)[STRATEGY_A_ID].lastRunDate === DATE);
  });
});
