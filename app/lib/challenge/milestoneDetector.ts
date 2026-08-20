import type { PaperTrade } from "@/app/lib/paperTrading/types";
import { appendEventIfAbsent } from "./store";
import type { ChallengeDailyRecord, ChallengeEvent, ChallengeEventType } from "./types";

// 資産額の節目（初期資金からの騰落率ベース。例の510,000/525,000/550,000/600,000円は
// それぞれ+2%/+5%/+10%/+20%に相当するため、この比率を一般化して以後の節目まで拾えるようにする）。
const UP_THRESHOLDS_PCT = [2, 5, 10, 20, 30, 50, 75, 100];
// 450,000/400,000円はそれぞれ-10%/-20%に相当する。
const DOWN_THRESHOLDS_PCT = [10, 20, 30, 50];
const TRADING_DAY_MILESTONES = [10, 20, 30, 60, 100];
const STREAK_MILESTONES = [3, 5, 10, 15, 20];

export interface DetectMilestonesInput {
  record: ChallengeDailyRecord;
  // 過去分すべて（当日は含まない、date昇順）。new_equity_high・new_max_drawdown判定に使う。
  previousRecords: ChallengeDailyRecord[];
  // 当日までの全Trade（exitAt昇順）。first_profit等の「初回」判定・streak判定に使う。
  cumulativeTradesOrderedAsc: PaperTrade[];
}

// Milestone/Eventの自動検出・記録。
//
// 設計：多くのイベント（first_profit・equity_milestone_up等）は「日付を含まない決定論的な
// eventId」を用い、条件が真である限り毎日appendEventIfAbsent()を試みる。冪等性はstore側の
// 重複チェックに一任するため、本関数側で「今日が初回か」を個別に判定するロジックは持たない
// （運用が数日空いて後からまとめて過去日を処理しても、条件が最初に真になった日のレコードで
// 正しく1回だけ記録される）。
// new_equity_high・new_max_drawdown・streakのように「前日との比較」が本質的に必要なものだけ、
// 日付入りeventIdと前日データとの比較を行う。
export async function detectAndRecordMilestones(input: DetectMilestonesInput): Promise<ChallengeEvent[]> {
  const { record, previousRecords, cumulativeTradesOrderedAsc } = input;
  const fired: ChallengeEvent[] = [];
  const createdAt = new Date().toISOString();

  async function tryFire(
    eventId: string,
    eventType: ChallengeEventType,
    eventData: Record<string, unknown> = {},
    related: { relatedTradeId?: string | null; relatedCode?: string | null } = {}
  ): Promise<void> {
    const event: ChallengeEvent = {
      eventId,
      eventType,
      occurredAt: record.generatedAt,
      tradingDayNumber: record.tradingDayNumber,
      totalAssets: record.totalAssets,
      cumulativeReturnPercent: record.cumulativeReturnPercent,
      relatedTradeId: related.relatedTradeId ?? null,
      relatedCode: related.relatedCode ?? null,
      snapshotId: record.morningSnapshotDate,
      strategyVersion: record.strategyVersion,
      eventData,
      createdAt,
    };
    const result = await appendEventIfAbsent(event);
    if (result.appended) fired.push(event);
  }

  // --- challenge_started（運用1営業日目） ---
  if (record.tradingDayNumber === 1) {
    await tryFire("challenge_started", "challenge_started");
  }

  // --- first_entry / first_exit ---
  if (record.entryCount > 0) await tryFire("first_entry", "first_entry", { entryCount: record.entryCount });
  if (record.exitCount > 0) await tryFire("first_exit", "first_exit", { exitCount: record.exitCount });

  // --- first_profit / first_loss / first_stop_loss / first_take_profit ---
  const firstWin = cumulativeTradesOrderedAsc.find((t) => t.realizedPnl > 0);
  if (firstWin) {
    await tryFire("first_profit", "first_profit", { realizedPnl: firstWin.realizedPnl }, { relatedTradeId: firstWin.id, relatedCode: firstWin.code });
  }
  const firstLoss = cumulativeTradesOrderedAsc.find((t) => t.realizedPnl <= 0);
  if (firstLoss) {
    await tryFire("first_loss", "first_loss", { realizedPnl: firstLoss.realizedPnl }, { relatedTradeId: firstLoss.id, relatedCode: firstLoss.code });
  }
  const firstStopLoss = cumulativeTradesOrderedAsc.find((t) => t.exitReason === "stop_loss");
  if (firstStopLoss) {
    await tryFire("first_stop_loss", "first_stop_loss", {}, { relatedTradeId: firstStopLoss.id, relatedCode: firstStopLoss.code });
  }
  const firstTakeProfit = cumulativeTradesOrderedAsc.find((t) => t.exitReason === "take_profit");
  if (firstTakeProfit) {
    await tryFire("first_take_profit", "first_take_profit", {}, { relatedTradeId: firstTakeProfit.id, relatedCode: firstTakeProfit.code });
  }

  // --- new_equity_high / new_max_drawdown（前日との比較が必要） ---
  const prevPeak = previousRecords.length > 0 ? previousRecords[previousRecords.length - 1]!.peakTotalAssets : -Infinity;
  if (record.totalAssets > prevPeak) {
    await tryFire(`new_equity_high-${record.date}`, "new_equity_high", { totalAssets: record.totalAssets });
  }
  const prevMaxDrawdown = previousRecords.length > 0 ? previousRecords[previousRecords.length - 1]!.maxDrawdownPercent : 0;
  if (record.maxDrawdownPercent > prevMaxDrawdown) {
    await tryFire(`new_max_drawdown-${record.date}`, "new_max_drawdown", { maxDrawdownPercent: record.maxDrawdownPercent });
  }

  // --- winning_streak / losing_streak（当日EXITがあった日のみ判定） ---
  if (record.exitCount > 0 && cumulativeTradesOrderedAsc.length > 0) {
    let streakLen = 0;
    let streakType: "win" | "loss" | null = null;
    for (let i = cumulativeTradesOrderedAsc.length - 1; i >= 0; i--) {
      const t = cumulativeTradesOrderedAsc[i]!;
      const isWin = t.realizedPnl > 0;
      if (streakType === null) {
        streakType = isWin ? "win" : "loss";
        streakLen = 1;
      } else if ((isWin && streakType === "win") || (!isWin && streakType === "loss")) {
        streakLen++;
      } else {
        break;
      }
    }
    if (streakType && STREAK_MILESTONES.includes(streakLen)) {
      const eventType: ChallengeEventType = streakType === "win" ? "winning_streak" : "losing_streak";
      await tryFire(`${eventType}-${record.date}-${streakLen}`, eventType, { streakLength: streakLen });
    }
  }

  // --- equity_milestone_up / equity_milestone_down（初期資金比の騰落率、日付を含まない決定論的ID） ---
  for (const pct of UP_THRESHOLDS_PCT) {
    const threshold = Math.round(record.initialCapital * (1 + pct / 100));
    if (record.totalAssets >= threshold) {
      await tryFire(`equity_milestone_up-${pct}pct`, "equity_milestone_up", { thresholdPercent: pct, thresholdAmount: threshold });
    }
  }
  for (const pct of DOWN_THRESHOLDS_PCT) {
    const threshold = Math.round(record.initialCapital * (1 - pct / 100));
    if (record.totalAssets <= threshold) {
      await tryFire(`equity_milestone_down-${pct}pct`, "equity_milestone_down", { thresholdPercent: pct, thresholdAmount: threshold });
    }
  }

  // --- benchmark_cross_above / benchmark_cross_below（初めての逆転のみ。日付を含まない決定論的ID） ---
  if (record.cumulativeReturnPercent > record.benchmarkCumulativeReturnPercent) {
    await tryFire("benchmark_cross_above", "benchmark_cross_above", {
      cumulativeReturnPercent: record.cumulativeReturnPercent,
      benchmarkCumulativeReturnPercent: record.benchmarkCumulativeReturnPercent,
    });
  }
  if (record.cumulativeReturnPercent < record.benchmarkCumulativeReturnPercent) {
    await tryFire("benchmark_cross_below", "benchmark_cross_below", {
      cumulativeReturnPercent: record.cumulativeReturnPercent,
      benchmarkCumulativeReturnPercent: record.benchmarkCumulativeReturnPercent,
    });
  }

  // --- trading_day_milestone（10/20/30/60/100営業日目） ---
  if (TRADING_DAY_MILESTONES.includes(record.tradingDayNumber)) {
    await tryFire(`trading_day_milestone-${record.tradingDayNumber}`, "trading_day_milestone", {
      tradingDayNumber: record.tradingDayNumber,
    });
  }

  return fired;
}
