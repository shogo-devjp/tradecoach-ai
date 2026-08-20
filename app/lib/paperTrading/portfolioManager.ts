import { enqueue, readJson, writeJson } from "./store";
import type {
  EntryExecution,
  ExecutionLogEntry,
  ExitExecution,
  PaperPortfolioSnapshot,
  PaperPortfolioState,
  PaperPosition,
  PaperTrade,
} from "./types";

const POSITIONS_FILE = "positions.json";
const TRADES_FILE = "trades.json";
const EXECUTION_LOG_FILE = "execution-log.json";
const PORTFOLIO_HISTORY_FILE = "portfolio-history.json";
const PORTFOLIO_STATE_FILE = "portfolio-state.json";

// --- Portfolio State（現金・累計損益・冪等性チェック用の実行済み日付） ---

async function readAllStates(): Promise<Record<string, PaperPortfolioState>> {
  return readJson<Record<string, PaperPortfolioState>>(PORTFOLIO_STATE_FILE, {});
}

export async function getPortfolioState(strategyId: string, initialCapital: number): Promise<PaperPortfolioState> {
  const all = await readAllStates();
  return (
    all[strategyId] ?? {
      strategyId,
      cash: initialCapital,
      cumulativeRealizedPnl: 0,
      peakTotalAssets: initialCapital,
      lastRunDate: null,
      lastSnapshotDate: null,
    }
  );
}

export async function savePortfolioState(state: PaperPortfolioState): Promise<void> {
  await enqueue(PORTFOLIO_STATE_FILE, async () => {
    const all = await readAllStates();
    all[state.strategyId] = state;
    await writeJson(PORTFOLIO_STATE_FILE, all);
  });
}

// --- Positions ---

async function readAllPositions(): Promise<PaperPosition[]> {
  return readJson<PaperPosition[]>(POSITIONS_FILE, []);
}

export async function getOpenPositions(strategyId: string): Promise<PaperPosition[]> {
  const all = await readAllPositions();
  return all.filter((p) => p.strategyId === strategyId && p.status === "open");
}

export async function getAllPositions(strategyId: string): Promise<PaperPosition[]> {
  const all = await readAllPositions();
  return all.filter((p) => p.strategyId === strategyId);
}

// 冪等性: 同一date・同一code・同一strategyIdのポジションが既に存在する場合は何もしない。
export async function positionExistsForToday(strategyId: string, code: string, date: string): Promise<boolean> {
  const all = await readAllPositions();
  return all.some((p) => p.id === `${strategyId}-${code}-${date}`);
}

export async function savePosition(position: PaperPosition): Promise<void> {
  await enqueue(POSITIONS_FILE, async () => {
    const all = await readAllPositions();
    const idx = all.findIndex((p) => p.id === position.id);
    if (idx >= 0) all[idx] = position;
    else all.push(position);
    await writeJson(POSITIONS_FILE, all);
  });
}

// --- Trades（決済済みの要約。成績計算の元データ） ---

export async function getTrades(strategyId: string): Promise<PaperTrade[]> {
  const all = await readJson<PaperTrade[]>(TRADES_FILE, []);
  return all.filter((t) => t.strategyId === strategyId);
}

export async function appendTrade(trade: PaperTrade): Promise<void> {
  await enqueue(TRADES_FILE, async () => {
    const all = await readJson<PaperTrade[]>(TRADES_FILE, []);
    all.push(trade);
    await writeJson(TRADES_FILE, all);
  });
}

// --- Execution Log（約定根拠の追跡ログ。不変・追記専用） ---

export async function appendExecutionLog(entry: ExecutionLogEntry): Promise<void> {
  await enqueue(EXECUTION_LOG_FILE, async () => {
    const all = await readJson<ExecutionLogEntry[]>(EXECUTION_LOG_FILE, []);
    all.push(entry);
    await writeJson(EXECUTION_LOG_FILE, all);
  });
}

export async function getExecutionLog(strategyId: string): Promise<ExecutionLogEntry[]> {
  const all = await readJson<ExecutionLogEntry[]>(EXECUTION_LOG_FILE, []);
  return all.filter((e) => e.strategyId === strategyId);
}

// --- Portfolio History（日次スナップショット） ---

export async function appendPortfolioSnapshot(snapshot: PaperPortfolioSnapshot): Promise<void> {
  await enqueue(PORTFOLIO_HISTORY_FILE, async () => {
    const all = await readJson<PaperPortfolioSnapshot[]>(PORTFOLIO_HISTORY_FILE, []);
    // 冪等性: 同日の重複run対策として、同一date・同一strategyIdがあれば置き換える
    const idx = all.findIndex((s) => s.strategyId === snapshot.strategyId && s.date === snapshot.date);
    if (idx >= 0) all[idx] = snapshot;
    else all.push(snapshot);
    await writeJson(PORTFOLIO_HISTORY_FILE, all);
  });
}

export async function getPortfolioHistory(strategyId: string): Promise<PaperPortfolioSnapshot[]> {
  const all = await readJson<PaperPortfolioSnapshot[]>(PORTFOLIO_HISTORY_FILE, []);
  return all.filter((s) => s.strategyId === strategyId).sort((a, b) => a.date.localeCompare(b.date));
}

// --- ヘルパー：ポジションを開く／閉じる ---

export function buildOpenPosition(params: {
  strategyId: string;
  code: string;
  name: string;
  date: string;
  snapshotId: string;
  buyJudgedAt: string;
  buySignalScore: number;
  buyReasons: string[];
  strategyVersion: string;
  shares: number;
  entry: EntryExecution;
  stopLoss: number;
  takeProfit: number;
  investedAmount: number;
}): PaperPosition {
  return {
    id: `${params.strategyId}-${params.code}-${params.date}`,
    strategyId: params.strategyId,
    code: params.code,
    name: params.name,
    snapshotId: params.snapshotId,
    buyJudgedAt: params.buyJudgedAt,
    buySignalScore: params.buySignalScore,
    buyReasons: params.buyReasons,
    strategyVersion: params.strategyVersion,
    shares: params.shares,
    status: "open",
    entry: params.entry,
    stopLoss: params.stopLoss,
    takeProfit: params.takeProfit,
    investedAmount: params.investedAmount,
  };
}

export function closePositionWith(position: PaperPosition, exit: ExitExecution, holdingDays: number): { position: PaperPosition; trade: PaperTrade } {
  const closed: PaperPosition = { ...position, status: "closed", exit, holdingDays };

  // commissionはfillPriceに含めず、実現損益の計算時に明示的に差し引く。
  const commissionTotal = position.entry.commission + exit.commission;
  const grossPnl = (exit.fillPrice - position.entry.fillPrice) * position.shares;
  const netPnl = Math.round((grossPnl - commissionTotal) * 10) / 10;
  const realizedPnlPercent = position.investedAmount > 0 ? Math.round((netPnl / position.investedAmount) * 1000) / 10 : 0;

  const trade: PaperTrade = {
    id: `${position.id}-trade`,
    strategyId: position.strategyId,
    code: position.code,
    name: position.name,
    shares: position.shares,
    entryFillPrice: position.entry.fillPrice,
    exitFillPrice: exit.fillPrice,
    entryAt: position.entry.plannedFillAt,
    exitAt: exit.processedAt,
    holdingDays,
    exitReason: exit.reason,
    realizedPnl: netPnl,
    realizedPnlPercent,
    commissionTotal,
  };

  return { position: closed, trade };
}
