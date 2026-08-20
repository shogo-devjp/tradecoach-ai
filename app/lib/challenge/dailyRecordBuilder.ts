import { STRATEGY_A_ID, STRATEGY_A_VERSION, getStrategyConfig } from "@/app/lib/paperTrading/config";
import { getAllPositions, getPortfolioHistory, getPortfolioState, getRejectedEntries, getTrades } from "@/app/lib/paperTrading/portfolioManager";
import { computePerformanceMetrics } from "@/app/lib/paperTrading/performanceMetrics";
import { getSignalSnapshotRows, getSnapshotCaptureResult } from "@/app/lib/paperTrading/signalSnapshotStore";
import type { PaperPosition } from "@/app/lib/paperTrading/types";
import { appendDailyRecordIfAbsent, getDailyRecord, readDailyRecords } from "./store";
import type { ChallengeDailyRecord, ChallengeDailyTradeEntry, ChallengeSelectionRecord } from "./types";
import { CHALLENGE_ID, CHALLENGE_INITIAL_CAPITAL } from "./challengeMeta";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

// position.code が指定日より前から保有中だったか（当日候補が「既に保有中のため対象外」に
// なったことを説明するための補助判定。約定ロジックには一切影響しない読み取り専用の判定）。
function wasHeldBeforeDate(positions: PaperPosition[], code: string, date: string): boolean {
  return positions.some((p) => {
    if (p.code !== code) return false;
    const entryDate = dateOf(p.entry.plannedFillAt);
    if (entryDate >= date) return false; // 当日以降にENTRYしたものは「既に保有中」ではない
    if (p.status === "open") return true;
    if (p.exit && dateOf(p.exit.processedAt) >= date) return true;
    return false;
  });
}

export interface BuildDailyRecordInput {
  date: string;
  strategyId?: string;
  now?: Date;
}

export interface BuildDailyRecordResult {
  created: boolean;
  reason?: "already_exists" | "portfolio_snapshot_not_found";
  record: ChallengeDailyRecord | null;
}

// 想定呼び出しタイミング（§10）：その日のPaper Trading EXIT/ENTRY処理（POST /paper-trading/run）と
// Universe Verification settleが完了した後。Paper Trading本体のPaperPortfolioSnapshotが
// SSOTであり、本関数はそれを含む既存の確定データを読み取って転記するだけで、
// 独自の金額・損益計算は一切行わない（totalAssets等はPaperPortfolioSnapshotの値をそのまま使う）。
//
// 冪等性：同一dateのDaily Recordが既に存在する場合は何もしない（過去の確定データを
// 現在の状態で上書きしない）。
export async function buildAndSaveDailyRecord(input: BuildDailyRecordInput): Promise<BuildDailyRecordResult> {
  const date = input.date;
  const strategyId = input.strategyId ?? STRATEGY_A_ID;
  const now = input.now ?? new Date();

  const existing = await getDailyRecord(date);
  if (existing) {
    return { created: false, reason: "already_exists", record: existing };
  }

  const config = await getStrategyConfig(strategyId);

  // --- Paper Trading本体のSSOT ---
  const [history, trades, positions, snapshotRows, captureResult, existingRecords, portfolioState] = await Promise.all([
    getPortfolioHistory(strategyId),
    getTrades(strategyId),
    getAllPositions(strategyId),
    getSignalSnapshotRows(date),
    getSnapshotCaptureResult(date),
    readDailyRecords(),
    getPortfolioState(strategyId, config.initialCapital),
  ]);

  const todaySnapshot = history.find((s) => s.date === date);
  if (!todaySnapshot) {
    // Paper Tradingの当日runがまだ完了していない（PaperPortfolioSnapshot未確定）。
    // fail-safe：Challenge記録を生成せず、Paper Trading本体には一切触れない。
    return { created: false, reason: "portfolio_snapshot_not_found", record: null };
  }

  const strategyVersion = snapshotRows[0]?.strategyVersion ?? STRATEGY_A_VERSION;

  // --- 資産（すべてPaperPortfolioSnapshotの確定値をそのまま転記） ---
  const historyUpToDate = history.filter((s) => s.date <= date);
  const previousRecord = existingRecords.filter((r) => r.date < date).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const previousTotalAssets = previousRecord ? previousRecord.totalAssets : config.initialCapital;
  const dailyPnl = round1(todaySnapshot.totalAssets - previousTotalAssets);
  const dailyReturnPercent = previousTotalAssets > 0 ? round1((dailyPnl / previousTotalAssets) * 100) : 0;

  // --- 累計成績（既存performanceMetrics.tsのcomputePerformanceMetrics()をそのまま再利用） ---
  const cumulativeTrades = trades.filter((t) => dateOf(t.exitAt) <= date);
  const metrics = computePerformanceMetrics(cumulativeTrades, historyUpToDate);
  const winCount = cumulativeTrades.filter((t) => t.realizedPnl > 0).length;
  const lossCount = cumulativeTrades.filter((t) => t.realizedPnl <= 0).length;

  // --- 当日の取引明細（当日ENTRY・当日EXITしたポジションから構成） ---
  const todaysTrades: ChallengeDailyTradeEntry[] = [];
  const todaysPositionIds = new Set<string>();
  const todaysTradeIds: string[] = [];
  const snapshotByCode = new Map(snapshotRows.map((r) => [r.code, r]));

  for (const p of positions) {
    const entryDate = dateOf(p.entry.plannedFillAt);
    if (entryDate === date) {
      todaysPositionIds.add(p.id);
      const snap = snapshotByCode.get(p.code);
      todaysTrades.push({
        positionId: p.id,
        tradeId: null,
        code: p.code,
        companyName: p.name,
        side: "ENTRY",
        signal: snap?.signal ?? null,
        score: snap?.score ?? p.buySignalScore,
        confidence: snap?.confidence ?? null,
        entryPrice: p.entry.fillPrice,
        exitPrice: null,
        shares: p.shares,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        realizedPnl: null,
        returnPercent: null,
        exitReason: null,
        holdingDays: null,
        snapshotId: p.snapshotId,
        strategyVersion: p.strategyVersion,
      });
    }
    if (p.status === "closed" && p.exit && dateOf(p.exit.processedAt) === date) {
      todaysPositionIds.add(p.id);
      const trade = trades.find((t) => t.id === `${p.id}-trade`) ?? null;
      if (trade) todaysTradeIds.push(trade.id);
      todaysTrades.push({
        positionId: p.id,
        tradeId: trade?.id ?? null,
        code: p.code,
        companyName: p.name,
        side: "EXIT",
        signal: snapshotByCode.get(p.code)?.signal ?? null,
        score: p.buySignalScore,
        confidence: null,
        entryPrice: p.entry.fillPrice,
        exitPrice: p.exit.fillPrice,
        shares: p.shares,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        realizedPnl: trade?.realizedPnl ?? null,
        returnPercent: trade?.realizedPnlPercent ?? null,
        exitReason: p.exit.reason,
        holdingDays: p.holdingDays ?? null,
        snapshotId: p.snapshotId,
        strategyVersion: p.strategyVersion,
      });
    }
  }

  const entryCount = todaysTrades.filter((t) => t.side === "ENTRY").length;
  const exitCount = todaysTrades.filter((t) => t.side === "EXIT").length;

  // --- 選定理由の復元（§3。当日のBUYシグナル銘柄のみ対象。既存strategyAと同じ並び順） ---
  const rejections = await getRejectedEntries(strategyId, date);
  const haltEntry = rejections.find((r) => r.code === "*");
  const rejectionByCode = new Map(rejections.filter((r) => r.code !== "*").map((r) => [r.code, r.reason]));
  const selectedCodes = new Set(positions.filter((p) => dateOf(p.entry.plannedFillAt) === date).map((p) => p.code));

  const selections: ChallengeSelectionRecord[] = snapshotRows
    .filter((row) => row.signal === "買い")
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.code.localeCompare(b.code))
    .map((row, index) => {
      const selected = selectedCodes.has(row.code);
      let rejectionReason: string | null = null;
      if (!selected) {
        if (haltEntry) {
          rejectionReason = haltEntry.reason;
        } else if (rejectionByCode.has(row.code)) {
          rejectionReason = rejectionByCode.get(row.code)!;
        } else if (wasHeldBeforeDate(positions, row.code, date)) {
          rejectionReason = "already_held";
        }
      }
      return {
        code: row.code,
        companyName: row.name,
        signal: row.signal,
        score: row.score,
        confidence: row.confidence,
        entryPriceCandidate: row.entryPriceCandidate,
        stopLoss: row.stopLoss,
        takeProfit: row.takeProfit,
        strategyVersion: row.strategyVersion,
        snapshotId: row.id,
        selectionRank: index + 1,
        selectedForPaperTrading: selected,
        rejectionReason,
      };
    });

  const buySignalCount = snapshotRows.filter((r) => r.signal === "買い").length;
  const sellSignalCount = snapshotRows.filter((r) => r.signal === "売り").length;
  const waitSignalCount = snapshotRows.filter((r) => r.signal === "待ち").length;

  const excessReturnPercentagePoints = round1(todaySnapshot.cumulativeReturnPercent - todaySnapshot.benchmarkReturnPercent);

  const record: ChallengeDailyRecord = {
    challengeId: CHALLENGE_ID,
    date,
    tradingDayNumber: existingRecords.length + 1,
    strategyVersion,
    marketSessionStatus: "trading_day",

    initialCapital: CHALLENGE_INITIAL_CAPITAL,
    cash: todaySnapshot.cash,
    positionsValue: todaySnapshot.positionsValue,
    totalAssets: todaySnapshot.totalAssets,
    dailyPnl,
    dailyReturnPercent,
    cumulativePnl: round1(todaySnapshot.totalAssets - config.initialCapital),
    cumulativeReturnPercent: todaySnapshot.cumulativeReturnPercent,
    // Paper Trading本体のPaperPortfolioState.peakTotalAssets（SSOT）をそのまま転記する。
    // 注意：この値は「直近のrun時点での最大資産」であり、Daily Recordは日付順に生成する運用を
    // 前提とする（過去日を後から遡って生成し直す場合は、その時点の最新peakと一致しない可能性がある）。
    peakTotalAssets: portfolioState.peakTotalAssets,
    drawdownPercent: todaySnapshot.drawdownPercent,
    maxDrawdownPercent: metrics.maxDrawdownPercent,

    benchmarkStartValue: config.initialCapital,
    benchmarkCurrentValue: todaySnapshot.benchmarkValue,
    benchmarkCumulativeReturnPercent: todaySnapshot.benchmarkReturnPercent,
    excessReturnPercentagePoints,
    benchmarkMethod: "price_return",
    benchmarkVersion: 1,

    universeSize: captureResult?.universeSize ?? (snapshotRows.length > 0 ? snapshotRows.length : null),
    buySignalCount,
    sellSignalCount,
    waitSignalCount,
    morningSnapshotDate: snapshotRows.length > 0 ? date : null,
    scanStartedAt: snapshotRows[0]?.scanStartedAt ?? null,
    scanCompletedAt: snapshotRows[0]?.scanCompletedAt ?? null,
    snapshotCapturedAt: snapshotRows[0]?.snapshotCapturedAt ?? captureResult?.capturedAt ?? null,

    entryCount,
    exitCount,
    openPositionCount: todaySnapshot.openPositionCount,
    realizedPnlToday: todaySnapshot.realizedPnlToday,
    cumulativeRealizedPnl: todaySnapshot.cumulativeRealizedPnl,
    winCount,
    lossCount,
    winRatePercent: metrics.winRate,
    profitFactor: metrics.profitFactor,

    trades: todaysTrades,
    selections,

    dailyDividendIncome: 0,
    cumulativeDividendIncome: 0,

    sourceRefs: {
      portfolioSnapshotDate: todaySnapshot.date,
      tradeIds: todaysTradeIds,
      positionIds: [...todaysPositionIds],
    },
    generatedAt: now.toISOString(),
  };

  const result = await appendDailyRecordIfAbsent(record);
  if (!result.appended) {
    // enqueue()で直列化されているため通常は到達しないが、念のため既存分を返す。
    const raced = await getDailyRecord(date);
    return { created: false, reason: "already_exists", record: raced };
  }

  return { created: true, record };
}
