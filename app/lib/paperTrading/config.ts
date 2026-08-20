import { readJson, writeJson } from "./store";
import type { PaperTradingConfig, StrategyConfig } from "./types";

export const STRATEGY_A_ID = "strategy-a-standard";
export const STRATEGY_A_VERSION = "strategy-a-standard@1";

// 設計書Rev.4で確定した初期値。config.jsonが未作成の場合はこの値で初期化する。
export const DEFAULT_STRATEGY_A_CONFIG: StrategyConfig = {
  strategyId: STRATEGY_A_ID,
  initialCapital: 500_000,
  lotSize: 100,
  maxPositions: 3,
  riskPercent: 0.02,
  entrySlippageBps: 10,
  exitSlippageBps: 10,
  commissionPerTrade: 0,
  maxHoldingDays: 20,
  dailyLossLimitPercent: 0.03,
  maxDrawdownHaltPercent: 0.15,
  abnormalPriceChangePercent: 0.25,
  benchmarkSymbol: "^N225",
};

const CONFIG_FILE = "config.json";

export async function getConfig(): Promise<PaperTradingConfig> {
  return readJson<PaperTradingConfig>(CONFIG_FILE, {
    strategies: { [STRATEGY_A_ID]: DEFAULT_STRATEGY_A_CONFIG },
  });
}

export async function getStrategyConfig(strategyId: string): Promise<StrategyConfig> {
  const config = await getConfig();
  const existing = config.strategies[strategyId];
  if (existing) return existing;
  if (strategyId === STRATEGY_A_ID) return DEFAULT_STRATEGY_A_CONFIG;
  throw new Error(`Unknown strategyId: ${strategyId}`);
}

export async function ensureConfigInitialized(): Promise<void> {
  const config = await readJson<PaperTradingConfig | null>(CONFIG_FILE, null);
  if (config) return;
  await writeJson<PaperTradingConfig>(CONFIG_FILE, { strategies: { [STRATEGY_A_ID]: DEFAULT_STRATEGY_A_CONFIG } });
}
