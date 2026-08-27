import { getPairConfig } from "../pairs";
import { fetchFxMultiTimeframeData } from "../data/yahooFxProvider";
import { analyzeFxPairById } from "../fxAnalysis";
import type { FxAnalysisResult } from "../types";
import { calculatePositionSize } from "./positionSizing";
import { applyEntryFill, applyExitFill, applyGapExitFill } from "./fills";
import { checkEntryTrigger } from "./entryTrigger";
import { evaluatePositionExit } from "./tradeOutcome";
import { addBusinessDays } from "./businessDays";
import { PAPER_TRADING_CONFIG } from "./config";
import { appendSkipped, appendTrade, loadState, saveState } from "./store";
import type { AnalysisSnapshot, ClosedTrade, PaperPosition, PendingSignal, PositionSide, SkippedSignal } from "./types";

const PAIR_ID = "USDJPY";

function buildSnapshot(analysis: FxAnalysisResult): AnalysisSnapshot {
  return {
    buyScore: analysis.score.buyScore,
    sellScore: analysis.score.sellScore,
    confidence: analysis.decision.confidence,
    marketRegime: analysis.marketRegime,
    timeframeDirections: analysis.multiTimeframe.directions,
    reasons: analysis.decision.reasons,
  };
}

function directionalSignal(analysis: FxAnalysisResult): { signal: "買い" | "売り"; side: PositionSide } | null {
  if (analysis.decision.signal === "買い") return { signal: "買い", side: "LONG" };
  if (analysis.decision.signal === "売り") return { signal: "売り", side: "SHORT" };
  return null;
}

export type TickAction =
  | "NO_OP_WAIT"
  | "PENDING_SIGNAL_CREATED"
  | "PENDING_SIGNAL_EXPIRED"
  | "ENTRY_FILLED"
  | "ENTRY_SKIPPED_MIN_UNIT"
  | "POSITION_HELD"
  | "POSITION_CLOSED";

export interface TickResult {
  action: TickAction;
  detail?: string;
}

// Paper Trading 1回ぶんのオーケストレーション。
// 「① 保有中はそれだけを監視 → ② エントリー待ちならエントリー判定 → ③ フラットなら新規分析」
// の順に処理し、常に高々1つの状態（position / pendingSignal / どちらも無し）だけを扱う
// ことで、二重エントリー・保有中の新規シグナル混入を防ぐ。
//
// 分析（analyzeFxPairById）・データ取得（fetchFxMultiTimeframeData、確定足フィルタ込み）は
// 既存FXエンジンをそのまま呼び出すだけで、スコアリング・判定閾値・indicator・
// Entry/SL/TP・Risk/Rewardのロジックには一切手を加えない。
export async function runPaperTradingTick(now: number = Date.now()): Promise<TickResult> {
  const pair = getPairConfig(PAIR_ID);
  const state = await loadState();

  // ① 保有中のポジション：新しいシグナルは一切見ず、監視だけ行う。
  if (state.position) {
    const position = state.position;
    const data = await fetchFxMultiTimeframeData(pair);
    const bars = data["5m"].filter((b) => b.time > position.lastMonitoredAt);

    const evalResult = evaluatePositionExit(position.side, position.stopLoss, position.takeProfit1, bars, position.maxHoldUntil, now);

    if (!evalResult.exited) {
      position.lastMonitoredAt = now;
      state.lastTickAt = now;
      await saveState(state);
      return { action: "POSITION_HELD" };
    }

    const exitReason = evalResult.exitReason!;
    const rawExitPrice = evalResult.rawExitPrice!;
    const exitPrice = evalResult.isGap ? applyGapExitFill(position.side, rawExitPrice) : applyExitFill(position.side, rawExitPrice, exitReason);

    const pnlJPY =
      position.side === "LONG" ? (exitPrice - position.entryPrice) * position.units : (position.entryPrice - exitPrice) * position.units;
    const equityAfter = position.equityAtEntry + pnlJPY;

    const exitReasonNote = evalResult.isGap
      ? "ギャップにより実観測価格で決済（想定より不利な可能性あり）"
      : exitReason === "TAKE_PROFIT"
        ? "Take Profit到達"
        : exitReason === "TIMEOUT"
          ? "最大保有期間超過によるタイムアウト決済"
          : "Stop Loss到達";

    const trade: ClosedTrade = {
      id: position.id,
      side: position.side,
      entryPrice: position.entryPrice,
      stopLoss: position.stopLoss,
      takeProfit1: position.takeProfit1,
      takeProfit2: position.takeProfit2,
      units: position.units,
      riskAmountJPY: position.riskAmountJPY,
      openedAt: position.openedAt,
      closedAt: evalResult.exitBarTime ?? now,
      exitPrice,
      exitReason,
      equityAtEntry: position.equityAtEntry,
      equityAfter,
      pnlJPY: Math.round(pnlJPY),
      pnlPercent: Math.round((pnlJPY / position.equityAtEntry) * 10000) / 100,
      realizedR: Math.round((pnlJPY / position.riskAmountJPY) * 1000) / 1000,
      entryReason: position.entryReason,
      exitReasonNote,
      snapshot: position.snapshot,
      analysisVersion: PAPER_TRADING_CONFIG.analysisVersion,
    };

    await appendTrade(trade);
    state.equity = equityAfter;
    state.position = null;
    state.lastTickAt = now;
    await saveState(state);
    return { action: "POSITION_CLOSED", detail: exitReason };
  }

  // ② エントリー待ちのシグナル：Entryゾーンへの到達 or タイムアウトを判定する。
  if (state.pendingSignal) {
    const pending = state.pendingSignal;

    if (now >= pending.expiresAt) {
      const skipped: SkippedSignal = {
        id: pending.id,
        signal: pending.signal,
        side: pending.side,
        createdAt: pending.createdAt,
        reason: "ENTRY_TIMEOUT",
        snapshot: pending.snapshot,
      };
      await appendSkipped(skipped);
      state.pendingSignal = null;
      state.lastTickAt = now;
      await saveState(state);
      return { action: "PENDING_SIGNAL_EXPIRED" };
    }

    const data = await fetchFxMultiTimeframeData(pair);
    const trigger = checkEntryTrigger(pending.side, pending.entryLow, pending.entryHigh, data["5m"]);

    if (!trigger.filled) {
      state.lastTickAt = now;
      await saveState(state);
      return { action: "NO_OP_WAIT", detail: "エントリー待ち継続" };
    }

    const entryPrice = applyEntryFill(pending.side, trigger.fillRawPrice!);
    const sizing = calculatePositionSize({ equity: state.equity, entryPrice, stopLoss: pending.stopLoss });

    if (!sizing.tradable) {
      const skipped: SkippedSignal = {
        id: pending.id,
        signal: pending.signal,
        side: pending.side,
        createdAt: pending.createdAt,
        reason: "MIN_UNIT_NOT_MET",
        snapshot: pending.snapshot,
      };
      await appendSkipped(skipped);
      state.pendingSignal = null;
      state.lastTickAt = now;
      await saveState(state);
      return { action: "ENTRY_SKIPPED_MIN_UNIT" };
    }

    const openedAt = trigger.filledAtBarTime ?? now;
    const position: PaperPosition = {
      id: pending.id,
      side: pending.side,
      entryPrice,
      stopLoss: pending.stopLoss,
      takeProfit1: pending.takeProfit1,
      takeProfit2: pending.takeProfit2,
      units: sizing.units,
      riskAmountJPY: sizing.riskAmountJPY,
      equityAtEntry: state.equity,
      openedAt,
      maxHoldUntil: addBusinessDays(openedAt, PAPER_TRADING_CONFIG.maxHoldingBusinessDays),
      lastMonitoredAt: openedAt,
      entryReason: pending.snapshot.reasons.join(" / "),
      snapshot: pending.snapshot,
    };

    state.position = position;
    state.pendingSignal = null;
    state.lastTickAt = now;
    await saveState(state);
    return { action: "ENTRY_FILLED" };
  }

  // ③ フラット：新規に分析する（既存のライブ分析パイプラインをそのまま利用、確定足フィルタ込み）。
  const analysis = await analyzeFxPairById(PAIR_ID);
  const directional = directionalSignal(analysis);

  if (!directional) {
    state.lastTickAt = now;
    await saveState(state);
    return { action: "NO_OP_WAIT", detail: "待ち" };
  }

  const pendingSignal: PendingSignal = {
    id: `${PAIR_ID}-${analysis.timestamp}`,
    signal: directional.signal,
    side: directional.side,
    createdAt: analysis.timestamp,
    expiresAt: analysis.timestamp + PAPER_TRADING_CONFIG.entryTimeoutMs,
    entryLow: analysis.priceLevels.entryLow,
    entryHigh: analysis.priceLevels.entryHigh,
    stopLoss: analysis.priceLevels.stopLoss,
    takeProfit1: analysis.priceLevels.takeProfit1,
    takeProfit2: analysis.priceLevels.takeProfit2,
    snapshot: buildSnapshot(analysis),
  };

  state.pendingSignal = pendingSignal;
  state.lastTickAt = now;
  await saveState(state);
  return { action: "PENDING_SIGNAL_CREATED", detail: directional.signal };
}
