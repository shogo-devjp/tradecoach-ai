import { readDailyRecords, readEvents, readStrategyHistory } from "./store";
import { CHALLENGE_INITIAL_CAPITAL } from "./challengeMeta";
import type { ChallengeDailyRecord, YoutubeReport } from "./types";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

// 任意期間のYouTube用集計レポートを生成する（§6）。読み取り専用。既に確定しているDaily Record
// （Paper Trading本体のSSOTをそのまま転記したもの）の単純な集計・並べ替えのみを行い、
// 資産額・損益等の独自の再計算は一切行わない（Best/Worst抽出や合計・最大値算出のみ）。
export async function buildYoutubeReport(from: string, to: string): Promise<YoutubeReport> {
  const [allRecords, allEvents, strategyHistoryAll] = await Promise.all([
    readDailyRecords(),
    readEvents(),
    readStrategyHistory(),
  ]);

  const recordsInRange = allRecords.filter((r) => r.date >= from && r.date <= to);
  const priorRecords = allRecords.filter((r) => r.date < from).sort((a, b) => b.date.localeCompare(a.date));
  const previousRecord: ChallengeDailyRecord | null = priorRecords[0] ?? null;

  const startingAssets = previousRecord ? previousRecord.totalAssets : CHALLENGE_INITIAL_CAPITAL;
  const startingBenchmark = previousRecord ? previousRecord.benchmarkCurrentValue : CHALLENGE_INITIAL_CAPITAL;

  const lastRecord = recordsInRange[recordsInRange.length - 1] ?? null;
  const endingAssets = lastRecord ? lastRecord.totalAssets : startingAssets;
  const endingBenchmark = lastRecord ? lastRecord.benchmarkCurrentValue : startingBenchmark;

  const pnl = round1(endingAssets - startingAssets);
  const returnPercent = startingAssets > 0 ? round1((pnl / startingAssets) * 100) : 0;
  const benchmarkReturnPercent = startingBenchmark > 0 ? round1(((endingBenchmark - startingBenchmark) / startingBenchmark) * 100) : 0;
  const excessReturnPercentagePoints = round1(returnPercent - benchmarkReturnPercent);

  const maxDrawdownPercent = recordsInRange.reduce((max, r) => Math.max(max, r.drawdownPercent), 0);

  const periodTrades = recordsInRange.flatMap((r) =>
    r.trades.filter((t) => t.side === "EXIT" && t.realizedPnl !== null).map((t) => ({ ...t, date: r.date }))
  );
  const wins = periodTrades.filter((t) => (t.realizedPnl ?? 0) > 0);
  const losses = periodTrades.filter((t) => (t.realizedPnl ?? 0) <= 0);
  const totalTrades = periodTrades.length;
  const winRatePercent = totalTrades > 0 ? round1((wins.length / totalTrades) * 100) : null;
  const grossProfit = wins.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.realizedPnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? round1(grossProfit / grossLoss) : null;

  const bestTradeRaw = periodTrades.reduce<(typeof periodTrades)[number] | null>(
    (best, t) => (best === null || (t.realizedPnl ?? -Infinity) > (best.realizedPnl ?? -Infinity) ? t : best),
    null
  );
  const worstTradeRaw = periodTrades.reduce<(typeof periodTrades)[number] | null>(
    (worst, t) => (worst === null || (t.realizedPnl ?? Infinity) < (worst.realizedPnl ?? Infinity) ? t : worst),
    null
  );

  const bestDayRaw = recordsInRange.reduce<ChallengeDailyRecord | null>(
    (best, r) => (best === null || r.dailyPnl > best.dailyPnl ? r : best),
    null
  );
  const worstDayRaw = recordsInRange.reduce<ChallengeDailyRecord | null>(
    (worst, r) => (worst === null || r.dailyPnl < worst.dailyPnl ? r : worst),
    null
  );

  const milestones = allEvents.filter((e) => {
    const d = dateOf(e.occurredAt);
    return d >= from && d <= to;
  });

  const sortedHistory = [...strategyHistoryAll].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const strategyVersionsUsed = sortedHistory.filter((entry, index) => {
    const effectiveTo = sortedHistory[index + 1]?.effectiveFrom ?? "9999-12-31";
    return entry.effectiveFrom <= to && effectiveTo > from;
  });

  return {
    from,
    to,
    tradingDayCount: recordsInRange.length,
    startingAssets,
    endingAssets,
    pnl,
    returnPercent,
    benchmarkReturnPercent,
    excessReturnPercentagePoints,
    maxDrawdownPercent,
    totalTrades,
    winCount: wins.length,
    lossCount: losses.length,
    winRatePercent,
    profitFactor,
    bestTrade: bestTradeRaw
      ? { date: bestTradeRaw.date, code: bestTradeRaw.code, companyName: bestTradeRaw.companyName, realizedPnl: bestTradeRaw.realizedPnl ?? 0, returnPercent: bestTradeRaw.returnPercent ?? 0 }
      : null,
    worstTrade: worstTradeRaw
      ? { date: worstTradeRaw.date, code: worstTradeRaw.code, companyName: worstTradeRaw.companyName, realizedPnl: worstTradeRaw.realizedPnl ?? 0, returnPercent: worstTradeRaw.returnPercent ?? 0 }
      : null,
    bestDay: bestDayRaw ? { date: bestDayRaw.date, dailyPnl: bestDayRaw.dailyPnl, dailyReturnPercent: bestDayRaw.dailyReturnPercent } : null,
    worstDay: worstDayRaw ? { date: worstDayRaw.date, dailyPnl: worstDayRaw.dailyPnl, dailyReturnPercent: worstDayRaw.dailyReturnPercent } : null,
    milestones,
    strategyVersionsUsed,
    buySignalTotal: recordsInRange.reduce((s, r) => s + r.buySignalCount, 0),
    sellSignalTotal: recordsInRange.reduce((s, r) => s + r.sellSignalCount, 0),
    waitSignalTotal: recordsInRange.reduce((s, r) => s + r.waitSignalCount, 0),
    entryTotal: recordsInRange.reduce((s, r) => s + r.entryCount, 0),
    exitTotal: recordsInRange.reduce((s, r) => s + r.exitCount, 0),
    equitySeries: recordsInRange.map((r) => ({ date: r.date, totalAssets: r.totalAssets, cumulativeReturnPercent: r.cumulativeReturnPercent })),
    benchmarkSeries: recordsInRange.map((r) => ({
      date: r.date,
      benchmarkValue: r.benchmarkCurrentValue,
      benchmarkCumulativeReturnPercent: r.benchmarkCumulativeReturnPercent,
    })),
    generatedAt: new Date().toISOString(),
  };
}
