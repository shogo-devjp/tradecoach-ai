import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { notifyChallengeDailyResult } from "../dailyResultNotifier";
import { upsertEveningOrchestrationRecord } from "../eveningOrchestrationStore";
import { appendDailyRecordIfAbsent } from "../store";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import type { ChallengeDailyRecord, ChallengeDailyTradeEntry } from "../types";
import type { Notifier, NotificationEvent } from "@/app/lib/notifications/types";
import { buildNotificationMessages } from "@/app/lib/notifications/messageBuilder";

function withIsolatedDirs<T>(fn: () => Promise<T>): Promise<T> {
  const challengeDir = mkdtempSync(path.join(tmpdir(), "notify-challenge-"));
  const stateDir = mkdtempSync(path.join(tmpdir(), "notify-state-"));
  process.env.CHALLENGE_DATA_DIR = challengeDir;
  process.env.NOTIFICATION_STATE_DIR = stateDir;
  return fn().finally(() => {
    rmSync(challengeDir, { recursive: true, force: true });
    rmSync(stateDir, { recursive: true, force: true });
    delete process.env.CHALLENGE_DATA_DIR;
    delete process.env.NOTIFICATION_STATE_DIR;
  });
}

// captureNotifier: 実際にLINEへは一切送らず、呼び出されたNotificationEventだけを記録するfake。
function captureNotifier(): { notifier: Notifier; events: NotificationEvent[] } {
  const events: NotificationEvent[] = [];
  return {
    events,
    notifier: {
      async notify(event) {
        events.push(event);
      },
    },
  };
}

function failingNotifier(): Notifier {
  return {
    async notify() {
      throw new Error("LINE API down (simulated)");
    },
  };
}

const DATE = "2026-08-21";

function makeTrade(overrides: Partial<ChallengeDailyTradeEntry> = {}): ChallengeDailyTradeEntry {
  return {
    positionId: `${STRATEGY_A_ID}-7267-${DATE}`,
    tradeId: null,
    code: "7267",
    companyName: "本田技研工業",
    side: "ENTRY",
    signal: "買い",
    score: 92,
    confidence: 83,
    entryPrice: 1736.7,
    exitPrice: null,
    shares: 200,
    stopLoss: 1688.5,
    takeProfit: 1847.5,
    realizedPnl: null,
    returnPercent: null,
    exitReason: null,
    holdingDays: null,
    snapshotId: `${DATE}-7267`,
    strategyVersion: "strategy-a-standard@1",
    ...overrides,
  };
}

function makeDailyRecord(overrides: Partial<ChallengeDailyRecord> = {}): ChallengeDailyRecord {
  return {
    challengeId: "ai-500k-challenge-strategy-a-standard-paper",
    date: DATE,
    tradingDayNumber: 1,
    strategyVersion: "strategy-a-standard@1",
    marketSessionStatus: "trading_day",
    initialCapital: 500000,
    cash: 14980,
    positionsValue: 488940,
    totalAssets: 503920,
    dailyPnl: 3920,
    dailyReturnPercent: 0.8,
    cumulativePnl: 3920,
    cumulativeReturnPercent: 0.8,
    peakTotalAssets: 503920,
    drawdownPercent: 0,
    maxDrawdownPercent: 0,
    benchmarkStartValue: 500000,
    benchmarkCurrentValue: 504499,
    benchmarkCumulativeReturnPercent: 0.9,
    excessReturnPercentagePoints: -0.1,
    benchmarkMethod: "price_return",
    benchmarkVersion: 1,
    universeSize: 225,
    buySignalCount: 72,
    sellSignalCount: 72,
    waitSignalCount: 81,
    morningSnapshotDate: DATE,
    scanStartedAt: `${DATE}T08:30:15+09:00`,
    scanCompletedAt: `${DATE}T08:30:35+09:00`,
    snapshotCapturedAt: `${DATE}T08:35:05+09:00`,
    entryCount: 3,
    exitCount: 0,
    openPositionCount: 3,
    realizedPnlToday: 0,
    cumulativeRealizedPnl: 0,
    winCount: 0,
    lossCount: 0,
    winRatePercent: null,
    profitFactor: null,
    trades: [makeTrade()],
    selections: [],
    dailyDividendIncome: 0,
    cumulativeDividendIncome: 0,
    sourceRefs: { portfolioSnapshotDate: DATE, tradeIds: [], positionIds: [`${STRATEGY_A_ID}-7267-${DATE}`] },
    generatedAt: `${DATE}T07:35:02.917Z`,
    ...overrides,
  };
}

async function seedSuccess(record: ChallengeDailyRecord) {
  await upsertEveningOrchestrationRecord(record.date, {
    paperTradingCompletedAt: `${record.date}T07:35:10.000Z`,
    verificationSettledAt: `${record.date}T07:35:18.000Z`,
    dailyRecordGeneratedAt: `${record.date}T07:35:18.900Z`,
    milestonesProcessedAt: `${record.date}T07:35:18.930Z`,
    successStep: "milestones",
    failedStep: null,
    errorReason: null,
    skipReason: null,
    retrySafe: true,
  });
  await appendDailyRecordIfAbsent(record);
}

// 1. 正常終了 → LINE結果通知1通
test("evening orchestration正常終了 → challenge_daily_result通知が1通送られる", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord();
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    const result = await notifyChallengeDailyResult({ date: DATE, notifier });

    assert.equal(result.outcome, "sent_result");
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "challenge_daily_result");
  });
});

// 2. ENTRYあり
test("ENTRYありの日はメッセージに新規ENTRY件数が反映される", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord({ entryCount: 3, trades: [makeTrade({ code: "7267" }), makeTrade({ code: "4689" }), makeTrade({ code: "9432" })] });
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    await notifyChallengeDailyResult({ date: DATE, notifier });
    const [message] = buildNotificationMessages(events[0]);

    assert.match(message, /新規ENTRY：3件/);
  });
});

// 3. 利確あり
test("利確ありの日は銘柄名と実現損益がメッセージに含まれる", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord({
      exitCount: 1,
      trades: [makeTrade({ side: "EXIT", code: "7267", companyName: "本田技研工業", realizedPnl: 4320, exitReason: "take_profit", tradeId: "t1" })],
    });
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    await notifyChallengeDailyResult({ date: DATE, notifier });
    const [message] = buildNotificationMessages(events[0]);

    assert.match(message, /利確：1件/);
    assert.match(message, /7267 本田技研工業/);
    assert.match(message, /実現損益：\+4,320円/);
    assert.doesNotMatch(message, /損切り：1件/);
  });
});

// 4. 損切りあり
test("損切りありの日は銘柄名と実現損益（マイナス）がメッセージに含まれる", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord({
      exitCount: 1,
      trades: [makeTrade({ side: "EXIT", code: "9432", companyName: "NTT", realizedPnl: -2150, exitReason: "stop_loss", tradeId: "t2" })],
    });
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    await notifyChallengeDailyResult({ date: DATE, notifier });
    const [message] = buildNotificationMessages(events[0]);

    assert.match(message, /損切り：1件/);
    assert.match(message, /9432 NTT/);
    assert.match(message, /実現損益：-2,150円/);
  });
});

// 5. ENTRY/EXITとも0件
test("取引ゼロの日も必ず1通通知され、0件と明記される", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord({ entryCount: 0, exitCount: 0, trades: [] });
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    const result = await notifyChallengeDailyResult({ date: DATE, notifier });
    const [message] = buildNotificationMessages(events[0]);

    assert.equal(result.outcome, "sent_result");
    assert.match(message, /新規ENTRY：0件/);
    assert.match(message, /利確：0件/);
    assert.match(message, /損切り：0件/);
  });
});

// 6. 保有継続のみ
test("保有継続のみ（ENTRY/EXITなし・保有あり）の日も正常に通知される", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord({ entryCount: 0, exitCount: 0, openPositionCount: 3, trades: [] });
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    await notifyChallengeDailyResult({ date: DATE, notifier });
    const [message] = buildNotificationMessages(events[0]);

    assert.match(message, /現在保有：3銘柄/);
  });
});

// 7. 日経225比較値が正しく表示される
test("日経225比較（ベンチマークリターン・超過リターン）が正しく表示される", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord({ benchmarkCumulativeReturnPercent: 0.9, excessReturnPercentagePoints: -0.1 });
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    await notifyChallengeDailyResult({ date: DATE, notifier });
    const [message] = buildNotificationMessages(events[0]);

    assert.match(message, /日経225：\+0\.90%/);
    assert.match(message, /日経225との差：-0\.10pt/);
  });
});

// 8. 同日再実行 → 二重通知されない
test("同日に複数回呼んでも通知は1回だけ（2回目はalready_notified）", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord();
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    const first = await notifyChallengeDailyResult({ date: DATE, notifier });
    const second = await notifyChallengeDailyResult({ date: DATE, notifier });
    const third = await notifyChallengeDailyResult({ date: DATE, notifier });

    assert.equal(first.outcome, "sent_result");
    assert.equal(second.outcome, "already_notified");
    assert.equal(third.outcome, "already_notified");
    assert.equal(events.length, 1, "notifier.notify()の呼び出しは1回だけ");
  });
});

// 9. LINE送信失敗 → Paper Trading確定データに影響なし
test("通知送信が失敗してもChallenge Daily Recordの確定データは変化しない（send_failedを返すのみ）", async () => {
  await withIsolatedDirs(async () => {
    const record = makeDailyRecord();
    await seedSuccess(record);
    const before = await (await import("../store")).getDailyRecord(DATE);

    const result = await notifyChallengeDailyResult({ date: DATE, notifier: failingNotifier() });

    const after = await (await import("../store")).getDailyRecord(DATE);
    assert.equal(result.outcome, "send_failed");
    assert.deepEqual(after, before, "Daily Recordは送信失敗前後で完全に不変");

    // マーカーも作られていないため、再試行すれば送信を再度試みられる（既定挙動の確認）。
    const retry = await notifyChallengeDailyResult({ date: DATE, notifier: captureNotifier().notifier });
    assert.equal(retry.outcome, "sent_result");
  });
});

// 10. evening orchestration失敗 → 正常結果通知を送らない
test("evening orchestrationが失敗した日はchallenge_daily_result通知を送らず、challenge_evening_errorのみ送る", async () => {
  await withIsolatedDirs(async () => {
    await upsertEveningOrchestrationRecord(DATE, {
      paperTradingCompletedAt: `${DATE}T07:35:10.000Z`,
      verificationSettledAt: null,
      dailyRecordGeneratedAt: null,
      milestonesProcessedAt: null,
      successStep: "paper_trading_run",
      failedStep: "verification_settle",
      errorReason: "Yahoo Finance timeout (simulated)",
      skipReason: null,
      retrySafe: true,
    });
    const { notifier, events } = captureNotifier();

    const result = await notifyChallengeDailyResult({ date: DATE, notifier });

    assert.equal(result.outcome, "sent_error");
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "challenge_evening_error");
    const [message] = buildNotificationMessages(events[0]);
    assert.match(message, /夕方処理エラー/);
    assert.match(message, /verification_settle/);
  });
});

// 11. 非営業日 → 通知しない
test("非営業日（skipReason設定済み）は通知そのものを送らない", async () => {
  await withIsolatedDirs(async () => {
    await upsertEveningOrchestrationRecord("2026-08-22", {
      paperTradingCompletedAt: null,
      verificationSettledAt: null,
      dailyRecordGeneratedAt: null,
      milestonesProcessedAt: null,
      successStep: null,
      failedStep: null,
      errorReason: null,
      skipReason: "not_a_trading_day",
      retrySafe: true,
    });
    const { notifier, events } = captureNotifier();

    const result = await notifyChallengeDailyResult({ date: "2026-08-22", notifier });

    assert.equal(result.outcome, "skipped_non_trading_day");
    assert.equal(events.length, 0);
  });
});

// evening orchestrationのレコード自体がまだ無い日（未処理）も通知しない
test("evening orchestrationレコードがまだ存在しない日は通知しない", async () => {
  await withIsolatedDirs(async () => {
    const { notifier, events } = captureNotifier();
    const result = await notifyChallengeDailyResult({ date: "2026-08-25", notifier });
    assert.equal(result.outcome, "skipped_not_ready");
    assert.equal(events.length, 0);
  });
});

// 朝のtodays_picks通知（kind="default"）と夕方のchallenge通知が互いに干渉しないことの確認
test("夕方通知のマーカーは朝のtodays_picks通知（default kind）とは独立したファイル名になる", async () => {
  await withIsolatedDirs(async () => {
    const { markNotifiedToday } = await import("@/app/lib/notifications/dailyNotifiedStore");
    // 朝の通知が先に送信済みだったとしても、夕方通知には一切影響しない
    // （DATEと同じ日付でマーカーを作るため、markNotifiedTodayにも同じ日時を明示的に渡す）
    await markNotifiedToday(undefined, new Date(`${DATE}T08:35:00+09:00`));

    const record = makeDailyRecord();
    await seedSuccess(record);
    const { notifier, events } = captureNotifier();

    const result = await notifyChallengeDailyResult({ date: DATE, notifier });

    assert.equal(result.outcome, "sent_result", "朝の通知マーカーがあっても夕方通知はブロックされない");
    assert.equal(events.length, 1);

    const markerFiles = readdirSync(process.env.NOTIFICATION_STATE_DIR!);
    assert.ok(markerFiles.some((f) => f === `line-notified-${DATE}`), "朝の通知マーカー(default)が存在する");
    assert.ok(
      markerFiles.some((f) => f.startsWith(`line-notified-challenge-evening-result-${STRATEGY_A_ID}-`)),
      "夕方通知の専用マーカーが独立して作られている"
    );
  });
});

// 12・13・14. Strategy A（Paper Trading）・Universe Verification・Challenge Daily Recordへの
// 書き込みが一切発生しないことのアーキテクチャレベルの確認。
// PAPER_TRADING_DATA_DIR・UNIVERSE_VERIFICATION_DATA_DIRを空の一時ディレクトリに向け、
// notifyChallengeDailyResult()呼び出し前後でそれらのディレクトリが「一切作られない／空のまま」
// であることを確認する（dailyResultNotifier.tsはこれらのモジュールを一切importしていないため
// 構造的に書き込み不可能だが、リグレッション検知のため実行時にも確認する）。
test("Strategy A / Universe Verification / Challenge Daily Recordのいずれにも書き込みが発生しない", async () => {
  await withIsolatedDirs(async () => {
    const paperDir = mkdtempSync(path.join(tmpdir(), "notify-isolation-paper-"));
    const universeDir = mkdtempSync(path.join(tmpdir(), "notify-isolation-universe-"));
    process.env.PAPER_TRADING_DATA_DIR = paperDir;
    process.env.UNIVERSE_VERIFICATION_DATA_DIR = universeDir;

    try {
      const record = makeDailyRecord();
      await seedSuccess(record);
      const { getDailyRecord } = await import("../store");
      const beforeRecord = await getDailyRecord(DATE);
      const { notifier } = captureNotifier();

      await notifyChallengeDailyResult({ date: DATE, notifier });

      assert.deepEqual(readdirSync(paperDir), [], "Paper Trading用データディレクトリに何も書き込まれない");
      assert.deepEqual(readdirSync(universeDir), [], "Universe Verification用データディレクトリに何も書き込まれない");
      const afterRecord = await getDailyRecord(DATE);
      assert.deepEqual(afterRecord, beforeRecord, "Challenge Daily Recordは通知処理の前後で完全に不変");
    } finally {
      rmSync(paperDir, { recursive: true, force: true });
      rmSync(universeDir, { recursive: true, force: true });
      delete process.env.PAPER_TRADING_DATA_DIR;
      delete process.env.UNIVERSE_VERIFICATION_DATA_DIR;
    }
  });
});
