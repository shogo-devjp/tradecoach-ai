import type { FxRiskReward } from "../types";

// リスクリワード比＝想定利益(TP1-エントリー)÷想定損失(エントリー-SL)。方向に関わらず絶対値で計算する。
// entryReferenceにはエントリー帯の中央値を渡す想定。
export function calculateFxRiskReward(
  entryReference: number,
  stopLoss: number,
  takeProfit1: number,
  pipSize: number
): FxRiskReward {
  const riskDistance = Math.abs(entryReference - stopLoss);
  const rewardDistance = Math.abs(takeProfit1 - entryReference);
  const ratio = riskDistance === 0 ? 0 : Math.round((rewardDistance / riskDistance) * 100) / 100;

  return {
    ratio,
    riskPips: Math.round((riskDistance / pipSize) * 10) / 10,
    rewardPips: Math.round((rewardDistance / pipSize) * 10) / 10,
  };
}
