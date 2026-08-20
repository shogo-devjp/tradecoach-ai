import type { DayBar } from "./exitResolver";

// 設計書§9の安全装置のうち、状態を持たない純粋な判定ロジックをまとめる。
// 「データがおかしい・足りない場合は必ず取引しない」を最優先するfail-safe群。

export function isValidBar(bar: Partial<DayBar> | null | undefined): bar is DayBar {
  if (!bar) return false;
  const { open, high, low, close } = bar;
  if (![open, high, low, close].every((v) => typeof v === "number" && Number.isFinite(v) && v > 0)) return false;
  if (high! < low!) return false;
  if (open! > high! || open! < low! || close! > high! || close! < low!) return false;
  return true;
}

// 前日終値に対する当日Openの変化率が異常値（デフォルト±25%超）かどうか。
export function isAbnormalPriceChange(previousClose: number, currentPrice: number, thresholdPercent: number): boolean {
  if (!(previousClose > 0) || !(currentPrice > 0)) return true; // データ自体が異常
  const changeRatio = Math.abs((currentPrice - previousClose) / previousClose);
  return changeRatio > thresholdPercent;
}

export function canOpenNewPosition(currentOpenPositionCount: number, maxPositions: number): boolean {
  return currentOpenPositionCount < maxPositions;
}

export interface NewBuyHaltInput {
  totalAssetsStartOfDay: number;
  totalAssetsNow: number;
  peakTotalAssets: number;
  dailyLossLimitPercent: number;
  maxDrawdownHaltPercent: number;
}

export interface NewBuyHaltResult {
  halted: boolean;
  reason?: string;
}

// 日次最大損失・最大ドローダウン到達で新規BUYを止めるかどうかを判定する。
// 既存ポジションのEXIT自体はこの判定の影響を受けない（呼び出し側で別途処理する）。
export function evaluateNewBuyHalt(input: NewBuyHaltInput): NewBuyHaltResult {
  const { totalAssetsStartOfDay, totalAssetsNow, peakTotalAssets, dailyLossLimitPercent, maxDrawdownHaltPercent } = input;

  if (totalAssetsStartOfDay > 0) {
    const dailyLossPercent = (totalAssetsStartOfDay - totalAssetsNow) / totalAssetsStartOfDay;
    if (dailyLossPercent > dailyLossLimitPercent) {
      return { halted: true, reason: `daily_loss_limit_exceeded(${(dailyLossPercent * 100).toFixed(1)}%)` };
    }
  }

  if (peakTotalAssets > 0) {
    const drawdownPercent = (peakTotalAssets - totalAssetsNow) / peakTotalAssets;
    if (drawdownPercent > maxDrawdownHaltPercent) {
      return { halted: true, reason: `max_drawdown_halt(${(drawdownPercent * 100).toFixed(1)}%)` };
    }
  }

  return { halted: false };
}
