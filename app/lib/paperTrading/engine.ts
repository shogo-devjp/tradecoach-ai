import { getStrategyConfig } from "./config";
import { strategyA } from "./strategyAdapter";
import { sizePosition } from "./positionSizer";
import { simulateEntry, simulateSlTpExit, simulateSignalExit } from "./executionSimulator";
import { canOpenNewPosition, evaluateNewBuyHalt, isAbnormalPriceChange, isValidBar } from "./riskManager";
import { startBenchmark, benchmarkValue, benchmarkReturnPercent, type BenchmarkState } from "./benchmarkTracker";
import { captureSignalSnapshot, getSignalSnapshotRows, type CachedScanLike } from "./signalSnapshotStore";
import {
  appendExecutionLog,
  appendPortfolioSnapshot,
  appendRejectedEntries,
  appendTrade,
  buildOpenPosition,
  closePositionWith,
  getOpenPositions,
  getPortfolioHistory,
  getPortfolioState,
  positionExistsForToday,
  savePortfolioState,
  savePosition,
} from "./portfolioManager";
import { enqueue, readJson, writeJson } from "./store";
import type { DayBar } from "./exitResolver";
import type {
  ExecutionLogEntry,
  ExitExecution,
  PaperPortfolioSnapshot,
  PaperPosition,
  SnapshotCaptureResult,
  StrategyConfig,
} from "./types";

// 8:30 → 9:00 → 夕方の3段タイムラインのうち、9:00に取得しても夕方に取得しても値が同一である
// 「その日の確定Open」を根拠に、9:00概念上のOpen基準約定を夕方バッチ内でまとめて処理する
// （設計書§7で協議のうえ確定した方針）。

export interface DailyBarProvider {
  getBar(symbol: string, date: string): Promise<DayBar | null>;
  getPreviousClose(symbol: string, date: string): Promise<number | null>;
}

function todayKeyJst(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function plannedFillAtOf(date: string): string {
  return `${date}T09:00:00+09:00`;
}

function holdingDaysBetween(entryDate: string, exitDate: string): number {
  const ms = new Date(`${exitDate}T00:00:00+09:00`).getTime() - new Date(`${entryDate}T00:00:00+09:00`).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

// 保有ポジション群の当日評価額の合計（データ欠損時はエントリー価格にフォールバックする）。
async function valuePositions(positions: PaperPosition[], barProvider: DailyBarProvider, date: string): Promise<number> {
  let value = 0;
  for (const p of positions) {
    const bar = await barProvider.getBar(p.code, date);
    const price = isValidBar(bar) ? bar.close : p.entry.fillPrice;
    value += price * p.shares;
  }
  return value;
}

// ============================================================================
// Snapshot捕捉
// ============================================================================

export interface CaptureSnapshotForStrategyInput {
  strategyId: string;
  cachedScan: CachedScanLike | null;
  now?: Date;
}

export async function captureSnapshotForStrategy(input: CaptureSnapshotForStrategyInput): Promise<SnapshotCaptureResult> {
  const config = await getStrategyConfig(input.strategyId);
  return captureSignalSnapshot({
    cachedScan: input.cachedScan,
    strategyVersion: strategyVersionFor(config),
    now: input.now,
  });
}

function strategyVersionFor(config: StrategyConfig): string {
  return config.strategyId === "strategy-a-standard" ? strategyA.version : config.strategyId;
}

// ============================================================================
// 日次run（6段構成: ①既存EXIT ②現金確定 ③新規ENTRY ④当日SL/TP判定 ⑤同日競合はSL優先 ⑥Portfolio確定）
// ============================================================================

export interface RunDailyInput {
  strategyId: string;
  date?: string;
  dryRun?: boolean;
  barProvider: DailyBarProvider;
  benchmarkBarProvider: DailyBarProvider;
  now?: Date;
}

export interface RunDailyResult {
  date: string;
  skipped: boolean;
  skipReason?: string;
  exitedPositionIds: string[];
  newlyOpenedPositionIds: string[];
  rejectedEntries: { code: string; reason: string }[];
  portfolioSnapshot?: PaperPortfolioSnapshot;
}

// benchmark-state.json: strategyIdごとの初回基準値（初回run時にのみ作成する）
async function getOrCreateBenchmarkState(
  strategyId: string,
  symbol: string,
  startDate: string,
  initialCapital: number,
  entryIndexPrice: number
): Promise<BenchmarkState> {
  return enqueue("benchmark-state.json", async () => {
    const all = await readJson<Record<string, BenchmarkState>>("benchmark-state.json", {});
    if (all[strategyId]) return all[strategyId];
    const state = startBenchmark(symbol, startDate, initialCapital, entryIndexPrice);
    all[strategyId] = state;
    await writeJson("benchmark-state.json", all);
    return state;
  });
}

export async function runDaily(input: RunDailyInput): Promise<RunDailyResult> {
  const now = input.now ?? new Date();
  const date = input.date ?? todayKeyJst(now);
  const processedAt = now.toISOString();
  const config = await getStrategyConfig(input.strategyId);
  const dryRun = input.dryRun ?? false;

  const portfolioStateBefore = await getPortfolioState(input.strategyId, config.initialCapital);

  // --- 冪等性: 同一dateに対して既にrun済みなら何もしない（同一runの二重実行でも二重約定させない） ---
  if (portfolioStateBefore.lastRunDate === date) {
    return { date, skipped: true, skipReason: "already_run_today", exitedPositionIds: [], newlyOpenedPositionIds: [], rejectedEntries: [] };
  }

  // --- 本稼働前の最終安全監査で追加したfail-safe ---
  // 冪等性チェック（lastRunDate）はportfolio-state.jsonの保存（このrunの最後に行われる）でしか
  // 更新されない。もしプロセスが「positions/trades/portfolio-history等は書き込み済みだが
  // portfolio-state.jsonの保存だけがまだ」という区間で異常終了した場合、lastRunDateは前回のままの
  // ため上のチェックをすり抜けてしまい、この関数は「今日はまだ未実行」と誤認して丸ごと再実行してしまう。
  // 再実行時のcashはportfolioStateBefore.cash（＝中断前の古い値）から計算し直されるため、
  // 既にpositions/trades側へ反映済みの当日の資金移動が二重に計算されない一方、
  // 古いcashのままportfolio-state.jsonが確定してしまい、cashとpositions/tradesの間で
  // サイレントな不整合が生じるおそれがある。
  // これを「気づかれないまま」にしないよう、同じ兆候（当日分のPortfolioSnapshotは既に存在するのに
  // lastRunDateが今日になっていない）を検知した場合は、黙って再実行せず例外で停止する
  // （運用者が手動でデータを確認できるようにするための最小限のfail-safe。
  // 自動修復・transaction機構の導入はスコープ外として別途判断する）。
  if (!dryRun) {
    const history = await getPortfolioHistory(input.strategyId);
    if (history.some((s) => s.date === date)) {
      throw new Error(
        `runDaily: ${date}分のPortfolioSnapshotは既に存在しますが、portfolio-state.jsonのlastRunDateが更新されていません。` +
          "前回の実行が書き込み処理の途中で中断された可能性があります。cashとpositions/tradesの整合性を手動で確認してから再実行してください。"
      );
    }
  }

  let cash = portfolioStateBefore.cash;
  const openPositionsBefore = await getOpenPositions(input.strategyId);
  const totalAssetsStartOfDay = cash + (await valuePositions(openPositionsBefore, input.barProvider, date));

  const exitedPositionIds: string[] = [];
  const newlyOpenedPositionIds: string[] = [];
  const rejectedEntries: { code: string; reason: string }[] = [];
  const positionsToSave: PaperPosition[] = [];
  const tradesToAppend: ReturnType<typeof closePositionWith>["trade"][] = [];
  const logsToAppend: ExecutionLogEntry[] = [];

  // 現在保有中（このrunの結果を反映した最新状態）を維持する作業用マップ
  const stillOpen = new Map(openPositionsBefore.map((p) => [p.id, p]));

  // ① 前日以前から保有しているポジションのEXIT判定
  const snapshotRows = await getSignalSnapshotRows(date);
  const snapshotByCode = new Map(snapshotRows.map((r) => [r.code, r]));

  for (const position of openPositionsBefore) {
    const bar = await input.barProvider.getBar(position.code, date);
    if (!isValidBar(bar)) continue; // データ欠損時は取引しない（fail-safe）

    const previousClose = await input.barProvider.getPreviousClose(position.code, date);
    if (previousClose !== null && isAbnormalPriceChange(previousClose, bar.open, config.abnormalPriceChangePercent)) continue;

    let exit: ExitExecution | null = simulateSlTpExit({
      bar,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      exitSlippageBps: config.exitSlippageBps,
      commission: config.commissionPerTrade,
      processedAt,
    });

    const holdingDaysSoFar = holdingDaysBetween(dateOf(position.entry.plannedFillAt), date);
    let exitJudgmentAt = position.entry.judgmentAt;

    if (!exit) {
      const snapshotRow = snapshotByCode.get(position.code);
      if (snapshotRow && snapshotRow.signal === "売り") {
        exit = simulateSignalExit({ bar, reason: "sell_signal", exitSlippageBps: config.exitSlippageBps, commission: config.commissionPerTrade, processedAt });
        exitJudgmentAt = snapshotRow.analyzedAt;
      } else if (holdingDaysSoFar >= config.maxHoldingDays) {
        exit = simulateSignalExit({ bar, reason: "max_holding_period", exitSlippageBps: config.exitSlippageBps, commission: config.commissionPerTrade, processedAt });
      }
    }

    if (exit) {
      const { position: closed, trade } = closePositionWith(position, exit, holdingDaysSoFar);
      cash += exit.fillPrice * position.shares - exit.commission;
      positionsToSave.push(closed);
      tradesToAppend.push(trade);
      exitedPositionIds.push(closed.id);
      stillOpen.delete(position.id);
      logsToAppend.push(
        buildExecutionLogEntry({ position: closed, side: "EXIT", reason: exit.reason, bar, referencePrice: exit.referencePrice, slippageBps: exit.exitSlippageBps, commission: exit.commission, fillPrice: exit.fillPrice, gapAdjusted: exit.gapAdjusted, sameDayConflict: exit.sameDayConflict, judgmentAt: exitJudgmentAt, processedAt })
      );
    }
  }

  // ② ①の結果をもとに現金残高を確定（cashは上のループで既に反映済み）
  const totalAssetsAfterExits = cash + (await valuePositions([...stillOpen.values()], input.barProvider, date));
  const halt = evaluateNewBuyHalt({
    totalAssetsStartOfDay,
    totalAssetsNow: totalAssetsAfterExits,
    peakTotalAssets: portfolioStateBefore.peakTotalAssets,
    dailyLossLimitPercent: config.dailyLossLimitPercent,
    maxDrawdownHaltPercent: config.maxDrawdownHaltPercent,
  });

  // ③④⑤ 当日Snapshotによる新規ENTRYをOpen基準で仮想約定し、直後に同日High/LowでSL/TP判定
  if (!halt.halted && snapshotRows.length > 0) {
    const decision = strategyA.decide({ snapshotRows, openPositions: [...stillOpen.values()] });

    for (const candidate of decision.buyCandidates) {
      if (!canOpenNewPosition(stillOpen.size, config.maxPositions)) {
        rejectedEntries.push({ code: candidate.code, reason: "max_positions_reached" });
        continue;
      }
      if (await positionExistsForToday(input.strategyId, candidate.code, date)) {
        rejectedEntries.push({ code: candidate.code, reason: "duplicate_order" });
        continue;
      }

      const bar = await input.barProvider.getBar(candidate.code, date);
      if (!isValidBar(bar)) {
        rejectedEntries.push({ code: candidate.code, reason: "data_unavailable" });
        continue;
      }
      const previousClose = await input.barProvider.getPreviousClose(candidate.code, date);
      if (previousClose !== null && isAbnormalPriceChange(previousClose, bar.open, config.abnormalPriceChangePercent)) {
        rejectedEntries.push({ code: candidate.code, reason: "abnormal_price" });
        continue;
      }

      // リスク予算の基準（totalAssets）は当日開始時点の値に固定する。現金制約（cashAvailable）は
      // 直前までの約定を反映した最新値を使うため、合計投資額が現金残高を超えることはない。
      const sizing = sizePosition({
        openPrice: bar.open,
        stopLoss: candidate.stopLoss,
        cashAvailable: cash,
        totalAssets: totalAssetsStartOfDay,
        lotSize: config.lotSize,
        riskPercent: config.riskPercent,
        entrySlippageBps: config.entrySlippageBps,
        exitSlippageBps: config.exitSlippageBps,
        commissionPerTrade: config.commissionPerTrade,
      });

      if (sizing.rejected) {
        rejectedEntries.push({ code: candidate.code, reason: sizing.reason ?? "rejected" });
        continue;
      }

      const entrySim = simulateEntry({ bar, stopLoss: candidate.stopLoss, entrySlippageBps: config.entrySlippageBps, commission: config.commissionPerTrade });
      if (entrySim.invalidatedByGap) {
        rejectedEntries.push({ code: candidate.code, reason: "invalidated_by_gap" });
        continue;
      }

      const shares = sizing.shares!;
      const entryFillPrice = sizing.entryFillPrice!;
      const investedAmount = sizing.investedAmount!;

      const position = buildOpenPosition({
        strategyId: input.strategyId,
        code: candidate.code,
        name: candidate.name,
        date,
        snapshotId: candidate.snapshotId,
        buyJudgedAt: candidate.judgmentAt,
        buySignalScore: candidate.score,
        buyReasons: candidate.reasons,
        strategyVersion: strategyVersionFor(config),
        shares,
        entry: {
          judgmentAt: candidate.judgmentAt,
          plannedFillAt: plannedFillAtOf(date),
          processedAt,
          dayOpen: bar.open,
          entrySlippageBps: config.entrySlippageBps,
          commission: config.commissionPerTrade,
          fillPrice: entryFillPrice,
          gapAdjusted: false,
          invalidatedByGap: false,
        },
        stopLoss: candidate.stopLoss,
        takeProfit: candidate.takeProfit,
        investedAmount,
      });

      cash -= investedAmount;

      logsToAppend.push(
        buildExecutionLogEntry({ position, side: "ENTRY", reason: "buy_signal", bar, referencePrice: bar.open, slippageBps: config.entrySlippageBps, commission: config.commissionPerTrade, fillPrice: entryFillPrice, gapAdjusted: false, sameDayConflict: false, judgmentAt: candidate.judgmentAt, processedAt })
      );

      // ④ 新規ENTRY銘柄について、約定後の当日High/LowによるSL/TP判定（同日EXITも通常の1取引として扱う）
      const sameDayExit = simulateSlTpExit({
        bar,
        stopLoss: candidate.stopLoss,
        takeProfit: candidate.takeProfit,
        exitSlippageBps: config.exitSlippageBps,
        commission: config.commissionPerTrade,
        processedAt,
      });

      if (sameDayExit) {
        const { position: closed, trade } = closePositionWith(position, sameDayExit, 0);
        cash += sameDayExit.fillPrice * shares - sameDayExit.commission;
        positionsToSave.push(closed);
        tradesToAppend.push(trade);
        exitedPositionIds.push(closed.id);
        newlyOpenedPositionIds.push(closed.id); // ENTRYと同日EXITも「新規に建てた」ものとして記録する
        logsToAppend.push(
          buildExecutionLogEntry({ position: closed, side: "EXIT", reason: sameDayExit.reason, bar, referencePrice: sameDayExit.referencePrice, slippageBps: sameDayExit.exitSlippageBps, commission: sameDayExit.commission, fillPrice: sameDayExit.fillPrice, gapAdjusted: sameDayExit.gapAdjusted, sameDayConflict: sameDayExit.sameDayConflict, judgmentAt: candidate.judgmentAt, processedAt })
        );
      } else {
        positionsToSave.push(position);
        newlyOpenedPositionIds.push(position.id);
        stillOpen.set(position.id, position);
      }
    }
  } else if (halt.halted) {
    rejectedEntries.push({ code: "*", reason: halt.reason ?? "new_buy_halted" });
  }

  // ⑥ Portfolioを最終確定
  const finalOpenPositions = [...stillOpen.values()];
  const positionsValue = await valuePositions(finalOpenPositions, input.barProvider, date);
  const unrealizedPnl = await unrealizedPnlOf(finalOpenPositions, input.barProvider, date);
  const totalAssetsEnd = cash + positionsValue;

  const realizedPnlToday = tradesToAppend.reduce((sum, t) => sum + t.realizedPnl, 0);
  const cumulativeRealizedPnl = portfolioStateBefore.cumulativeRealizedPnl + realizedPnlToday;
  const cumulativeReturnPercent = Math.round(((totalAssetsEnd - config.initialCapital) / config.initialCapital) * 1000) / 10;
  const peakTotalAssets = Math.max(portfolioStateBefore.peakTotalAssets, totalAssetsEnd);
  const drawdownPercent = peakTotalAssets > 0 ? Math.round(((peakTotalAssets - totalAssetsEnd) / peakTotalAssets) * 1000) / 10 : 0;

  const benchmarkBar = await input.benchmarkBarProvider.getBar(config.benchmarkSymbol, date);
  let benchmarkVal = config.initialCapital;
  let benchmarkReturn = 0;
  if (benchmarkBar) {
    const state = await getOrCreateBenchmarkState(input.strategyId, config.benchmarkSymbol, date, config.initialCapital, benchmarkBar.open);
    benchmarkVal = Math.round(benchmarkValue(state, benchmarkBar.close));
    benchmarkReturn = benchmarkReturnPercent(state, benchmarkBar.close);
  }

  const snapshot: PaperPortfolioSnapshot = {
    strategyId: input.strategyId,
    date,
    cash: Math.round(cash),
    positionsValue: Math.round(positionsValue),
    totalAssets: Math.round(totalAssetsEnd),
    unrealizedPnl: Math.round(unrealizedPnl),
    realizedPnlToday: Math.round(realizedPnlToday * 10) / 10,
    cumulativeRealizedPnl: Math.round(cumulativeRealizedPnl * 10) / 10,
    cumulativeReturnPercent,
    benchmarkValue: benchmarkVal,
    benchmarkReturnPercent: benchmarkReturn,
    drawdownPercent,
    openPositionCount: finalOpenPositions.length,
    newBuyHalted: halt.halted,
    haltReason: halt.reason,
  };

  if (!dryRun) {
    for (const position of positionsToSave) await savePosition(position);
    for (const trade of tradesToAppend) await appendTrade(trade);
    for (const log of logsToAppend) await appendExecutionLog(log);
    await appendPortfolioSnapshot(snapshot);
    // 判断・約定ロジックには一切影響しない追記専用ログ（YouTube記録レイヤーが
    // 「なぜ買わなかったか」を後から参照するためのもの。既に計算済みの結果を保存するだけ）。
    await appendRejectedEntries(input.strategyId, date, rejectedEntries);
    await savePortfolioState({
      strategyId: input.strategyId,
      cash: Math.round(cash),
      cumulativeRealizedPnl: Math.round(cumulativeRealizedPnl * 10) / 10,
      peakTotalAssets: Math.round(peakTotalAssets),
      lastRunDate: date,
      lastSnapshotDate: portfolioStateBefore.lastSnapshotDate,
    });
  }

  return { date, skipped: false, exitedPositionIds, newlyOpenedPositionIds, rejectedEntries, portfolioSnapshot: snapshot };
}

async function unrealizedPnlOf(positions: PaperPosition[], barProvider: DailyBarProvider, date: string): Promise<number> {
  let total = 0;
  for (const p of positions) {
    const bar = await barProvider.getBar(p.code, date);
    const price = isValidBar(bar) ? bar.close : p.entry.fillPrice;
    total += (price - p.entry.fillPrice) * p.shares;
  }
  return total;
}

function buildExecutionLogEntry(params: {
  position: PaperPosition;
  side: "ENTRY" | "EXIT";
  reason: ExecutionLogEntry["reason"];
  bar: DayBar;
  referencePrice: number;
  slippageBps: number;
  commission: number;
  fillPrice: number;
  gapAdjusted: boolean;
  sameDayConflict: boolean;
  judgmentAt: string;
  processedAt: string;
}): ExecutionLogEntry {
  const { position, side, reason, bar, referencePrice, slippageBps, commission, fillPrice, gapAdjusted, sameDayConflict, judgmentAt, processedAt } = params;
  return {
    id: `${position.id}-${side}-${processedAt}`,
    positionId: position.id,
    strategyId: position.strategyId,
    code: position.code,
    snapshotId: position.snapshotId,
    side,
    reason,
    dayOpen: bar.open,
    dayHigh: bar.high,
    dayLow: bar.low,
    dayClose: bar.close,
    referencePrice,
    slippageBps,
    commission,
    fillPrice,
    gapAdjusted,
    sameDayConflict,
    judgmentAt,
    plannedFillAt: position.entry.plannedFillAt,
    processedAt,
  };
}
