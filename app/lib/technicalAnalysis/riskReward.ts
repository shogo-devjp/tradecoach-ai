// リスクリワード比＝想定利益(利確-エントリー)÷想定損失(エントリー-損切)。
// 売買方向に関わらず絶対値で計算する（利確・損切は既にsignalに応じた向きで算出済みのため）。
export function calculateRiskReward(entryPrice: number, takeProfit: number, stopLoss: number): number {
  const reward = Math.abs(takeProfit - entryPrice);
  const risk = Math.abs(entryPrice - stopLoss);
  if (risk === 0) return 0;
  return Math.round((reward / risk) * 100) / 100;
}
