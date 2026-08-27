import { PAPER_TRADING_CONFIG } from "./config";
import type { ClosedTrade, PositionSide } from "./types";

interface SideStats {
  count: number;
  win: number;
  loss: number;
  winRate: number | null;
  avgProfitR: number | null;
  avgLossR: number | null;
  expectancyR: number | null;
}

export interface PaperTradingReport {
  initialEquityJPY: number;
  currentEquityJPY: number;
  cumulativePnlJPY: number;
  cumulativePnlPercent: number;
  totalTrades: number;
  win: number;
  loss: number;
  winRate: number | null;
  avgProfitJPY: number | null;
  avgLossJPY: number | null;
  avgRealizedR: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  maxDrawdownJPY: number;
  maxDrawdownPercent: number;
  maxWinStreak: number;
  maxLossStreak: number;
  bySide: Record<PositionSide, SideStats>;
  waitRate: null; // WAIT率はシグナル生成側（tick履歴）が別途必要。Phase 1ではトレード記録のみから算出不可のためnull固定
}

function isWin(t: ClosedTrade): boolean {
  return t.pnlJPY > 0;
}
function isLoss(t: ClosedTrade): boolean {
  return t.pnlJPY < 0;
}

function computeSideStats(trades: ClosedTrade[]): SideStats {
  const win = trades.filter(isWin);
  const loss = trades.filter(isLoss);
  const decided = win.length + loss.length;

  return {
    count: trades.length,
    win: win.length,
    loss: loss.length,
    winRate: decided > 0 ? Math.round((win.length / decided) * 1000) / 10 : null,
    avgProfitR: win.length > 0 ? avg(win.map((t) => t.realizedR)) : null,
    avgLossR: loss.length > 0 ? avg(loss.map((t) => t.realizedR)) : null,
    expectancyR: decided > 0 ? avg(trades.map((t) => t.realizedR)) : null,
  };
}

function avg(values: number[]): number {
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 1000) / 1000;
}

// 累積損益からの最大ドローダウン（資産曲線ベース）を計算する。
function computeMaxDrawdown(trades: ClosedTrade[]): { jpy: number; percent: number } {
  let peak = trades.length > 0 ? trades[0].equityAtEntry : PAPER_TRADING_CONFIG.initialEquityJPY;
  let maxDdJpy = 0;
  let maxDdPercent = 0;

  for (const t of trades) {
    peak = Math.max(peak, t.equityAfter);
    const dd = peak - t.equityAfter;
    const ddPercent = peak > 0 ? (dd / peak) * 100 : 0;
    if (dd > maxDdJpy) maxDdJpy = dd;
    if (ddPercent > maxDdPercent) maxDdPercent = ddPercent;
  }

  return { jpy: Math.round(maxDdJpy), percent: Math.round(maxDdPercent * 10) / 10 };
}

function computeStreaks(trades: ClosedTrade[]): { maxWin: number; maxLoss: number } {
  let maxWin = 0;
  let maxLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;

  for (const t of trades) {
    if (isWin(t)) {
      currentWin += 1;
      currentLoss = 0;
    } else if (isLoss(t)) {
      currentLoss += 1;
      currentWin = 0;
    } else {
      currentWin = 0;
      currentLoss = 0;
    }
    maxWin = Math.max(maxWin, currentWin);
    maxLoss = Math.max(maxLoss, currentLoss);
  }

  return { maxWin, maxLoss };
}

// トレード一覧から成績を再計算する（保存データ自体には集計値を持たせず、常にここから
// 再計算できるようにする）。将来バックテスト側の集計にも同じ考え方の関数を流用できる。
export function buildPaperTradingReport(trades: ClosedTrade[], currentEquityJPY: number): PaperTradingReport {
  const initialEquityJPY = PAPER_TRADING_CONFIG.initialEquityJPY;
  const win = trades.filter(isWin);
  const loss = trades.filter(isLoss);
  const decided = win.length + loss.length;

  const totalProfitJPY = win.reduce((s, t) => s + t.pnlJPY, 0);
  const totalLossJPY = Math.abs(loss.reduce((s, t) => s + t.pnlJPY, 0));

  const drawdown = computeMaxDrawdown(trades);
  const streaks = computeStreaks(trades);

  const longTrades = trades.filter((t) => t.side === "LONG");
  const shortTrades = trades.filter((t) => t.side === "SHORT");

  return {
    initialEquityJPY,
    currentEquityJPY,
    cumulativePnlJPY: Math.round(currentEquityJPY - initialEquityJPY),
    cumulativePnlPercent: Math.round(((currentEquityJPY - initialEquityJPY) / initialEquityJPY) * 1000) / 10,
    totalTrades: trades.length,
    win: win.length,
    loss: loss.length,
    winRate: decided > 0 ? Math.round((win.length / decided) * 1000) / 10 : null,
    avgProfitJPY: win.length > 0 ? Math.round(avg(win.map((t) => t.pnlJPY))) : null,
    avgLossJPY: loss.length > 0 ? Math.round(avg(loss.map((t) => t.pnlJPY))) : null,
    avgRealizedR: trades.length > 0 ? avg(trades.map((t) => t.realizedR)) : null,
    expectancyR: trades.length > 0 ? avg(trades.map((t) => t.realizedR)) : null,
    profitFactor: totalLossJPY > 0 ? Math.round((totalProfitJPY / totalLossJPY) * 100) / 100 : null,
    maxDrawdownJPY: drawdown.jpy,
    maxDrawdownPercent: drawdown.percent,
    maxWinStreak: streaks.maxWin,
    maxLossStreak: streaks.maxLoss,
    bySide: {
      LONG: computeSideStats(longTrades),
      SHORT: computeSideStats(shortTrades),
    },
    waitRate: null,
  };
}
