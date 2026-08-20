import type { PaperPortfolioSnapshot, PaperTrade } from "./types";

export interface PerformanceMetrics {
  totalTrades: number;
  winRate: number | null; // %
  averageWin: number | null; // 円
  averageLoss: number | null; // 円（負値）
  profitFactor: number | null;
  totalReturnPercent: number;
  annualizedReturnPercent: number | null;
  maxDrawdownPercent: number;
  sharpeRatio: number | null;
  averageHoldingDays: number | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// 単純な母標準偏差（Sharpe計算用）。
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computePerformanceMetrics(trades: PaperTrade[], portfolioHistory: PaperPortfolioSnapshot[]): PerformanceMetrics {
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.realizedPnl > 0);
  const losses = trades.filter((t) => t.realizedPnl <= 0);

  const winRate = totalTrades > 0 ? round1((wins.length / totalTrades) * 100) : null;
  const averageWin = wins.length > 0 ? round1(wins.reduce((s, t) => s + t.realizedPnl, 0) / wins.length) : null;
  const averageLoss = losses.length > 0 ? round1(losses.reduce((s, t) => s + t.realizedPnl, 0) / losses.length) : null;

  const grossProfit = wins.reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.realizedPnl, 0));
  const profitFactor = grossLoss > 0 ? round1(grossProfit / grossLoss) : grossProfit > 0 ? null : null;

  const averageHoldingDays =
    totalTrades > 0 ? round1(trades.reduce((s, t) => s + t.holdingDays, 0) / totalTrades) : null;

  const first = portfolioHistory[0];
  const last = portfolioHistory[portfolioHistory.length - 1];
  const totalReturnPercent = last ? last.cumulativeReturnPercent : 0;

  let annualizedReturnPercent: number | null = null;
  if (first && last && portfolioHistory.length > 1) {
    const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (1000 * 60 * 60 * 24);
    if (days > 0) {
      const totalReturnRatio = 1 + totalReturnPercent / 100;
      if (totalReturnRatio > 0) {
        annualizedReturnPercent = round1((totalReturnRatio ** (365 / days) - 1) * 100);
      }
    }
  }

  const maxDrawdownPercent = portfolioHistory.reduce((max, snap) => Math.max(max, snap.drawdownPercent), 0);

  let sharpeRatio: number | null = null;
  if (portfolioHistory.length > 1) {
    const dailyReturns: number[] = [];
    for (let i = 1; i < portfolioHistory.length; i++) {
      const prev = portfolioHistory[i - 1]!.totalAssets;
      const curr = portfolioHistory[i]!.totalAssets;
      if (prev > 0) dailyReturns.push((curr - prev) / prev);
    }
    const sd = stdDev(dailyReturns);
    if (sd > 0) {
      const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
      // 年率換算（営業日ベース、無リスク金利は簡略化のため0とする）
      sharpeRatio = round1((mean / sd) * Math.sqrt(252));
    }
  }

  return {
    totalTrades,
    winRate,
    averageWin,
    averageLoss,
    profitFactor,
    totalReturnPercent,
    annualizedReturnPercent,
    maxDrawdownPercent,
    sharpeRatio,
    averageHoldingDays,
  };
}
