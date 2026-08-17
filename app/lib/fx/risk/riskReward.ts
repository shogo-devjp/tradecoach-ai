import type { FxPriceLevels, RiskRewardResult } from "../types";
import { FX_CONFIG } from "../config";
import type { TentativeDirection } from "./priceLevels";

// TakeProfit1を基準にリスクリワード比を計算する（要件10）。
// リスクリワードが悪い場合はテクニカル的にBUY/SELL条件でも最終的にWAITへ倒すため、
// isAcceptableフラグをここで確定させ、decision.ts側で参照する。
export function calculateRiskReward(priceLevels: FxPriceLevels, direction: TentativeDirection): RiskRewardResult {
  const entry = direction === "sell" ? priceLevels.entryLow : priceLevels.entryHigh;
  const risk = Math.abs(entry - priceLevels.stopLoss);
  const reward = Math.abs(priceLevels.takeProfit1 - entry);

  if (risk === 0) return { ratio: 0, isAcceptable: false };

  const ratio = Math.round((reward / risk) * 100) / 100;
  return { ratio, isAcceptable: ratio >= FX_CONFIG.decision.minRiskReward };
}
