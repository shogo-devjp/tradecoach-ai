import { resolveSlTpExit, type DayBar } from "./exitResolver";
import type { ExitExecution, ExitReason } from "./types";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface SimulateEntryInput {
  bar: DayBar;
  stopLoss: number; // エントリー前提としていたSL（Snapshot時点の値）
  entrySlippageBps: number;
  commission: number;
}

export interface SimulateEntryResult {
  invalidatedByGap: boolean; // Openが約定前提のSLを既に割り込んでいたため見送り
  fillPrice: number;
}

// エントリー約定価格を計算する。実際のOpenがSnapshot時点のSLを既に下回っていた場合（＝寄付前に
// 前提が崩れているケース）は、エントリーそのものを見送る（無効化されたセットアップとして扱う）。
export function simulateEntry(input: SimulateEntryInput): SimulateEntryResult {
  const { bar, stopLoss, entrySlippageBps } = input;

  if (bar.open <= stopLoss) {
    return { invalidatedByGap: true, fillPrice: bar.open };
  }

  const fillPrice = round1(bar.open * (1 + entrySlippageBps / 10000));
  return { invalidatedByGap: false, fillPrice };
}

export interface SimulateExitInput {
  bar: DayBar;
  stopLoss: number;
  takeProfit: number;
  exitSlippageBps: number;
  commission: number;
  processedAt: string;
}

// SL/TP到達によるEXIT約定価格を計算する（Gap・同日競合はexitResolverに委譲）。
// 到達していなければnullを返す（呼び出し側でSELL判定・最大保有期間の判定に進む）。
export function simulateSlTpExit(input: SimulateExitInput): ExitExecution | null {
  const { bar, stopLoss, takeProfit, exitSlippageBps, commission, processedAt } = input;
  const resolution = resolveSlTpExit(bar, stopLoss, takeProfit);
  if (!resolution.triggered || resolution.referencePrice === undefined || !resolution.reason) return null;

  const fillPrice = round1(resolution.referencePrice * (1 - exitSlippageBps / 10000));

  return {
    reason: resolution.reason,
    dayOpen: bar.open,
    dayHigh: bar.high,
    dayLow: bar.low,
    dayClose: bar.close,
    referencePrice: resolution.referencePrice,
    exitSlippageBps,
    commission,
    fillPrice,
    gapAdjusted: resolution.gapAdjusted,
    sameDayConflict: resolution.sameDayConflict,
    processedAt,
  };
}

// SELL判定・最大保有期間によるEXIT約定価格を計算する（エントリーと同じくOpen基準）。
export function simulateSignalExit(input: {
  bar: DayBar;
  reason: Extract<ExitReason, "sell_signal" | "max_holding_period">;
  exitSlippageBps: number;
  commission: number;
  processedAt: string;
}): ExitExecution {
  const { bar, reason, exitSlippageBps, commission, processedAt } = input;
  const fillPrice = round1(bar.open * (1 - exitSlippageBps / 10000));
  return {
    reason,
    dayOpen: bar.open,
    dayHigh: bar.high,
    dayLow: bar.low,
    dayClose: bar.close,
    referencePrice: bar.open,
    exitSlippageBps,
    commission,
    fillPrice,
    gapAdjusted: false,
    sameDayConflict: false,
    processedAt,
  };
}
