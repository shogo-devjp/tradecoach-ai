// 設計書Rev.4 §9。以下3条件を同時に満たす最大株数を100株単位で算出する。
//  ① cash available（現金残高。1銘柄配分比率の上限は撤廃済み）
//  ② 1取引最大許容損失＝総資産の2%（entry/exit双方のslippage込みで計算）
//  ③ 100株単位（lotSize）
//
// fail-safe: SLがentry基準価格以上、またはslippage込みでperShareRiskが0以下の場合は
// 現金制約へフォールbackさせず、即座に invalid_stop_loss として拒否する。

export type SizingRejectReason = "invalid_stop_loss" | "insufficient_funds_for_minimum_unit" | "cash_would_go_negative";

export interface SizePositionInput {
  openPrice: number;
  stopLoss: number;
  cashAvailable: number;
  totalAssets: number;
  lotSize?: number;
  riskPercent?: number;
  entrySlippageBps?: number;
  exitSlippageBps?: number;
  commissionPerTrade?: number;
}

export interface SizePositionResult {
  rejected: boolean;
  reason?: SizingRejectReason;
  shares?: number;
  entryFillPrice?: number;
  investedAmount?: number;
  cashAfterEntry?: number;
  perShareRisk?: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function sizePosition(input: SizePositionInput): SizePositionResult {
  const {
    openPrice,
    stopLoss,
    cashAvailable,
    totalAssets,
    lotSize = 100,
    riskPercent = 0.02,
    entrySlippageBps = 10,
    exitSlippageBps = 10,
    commissionPerTrade = 0,
  } = input;

  // --- fail-safe: SLが無効な水準（理論値の時点で既におかしい）なら即座に拒否する ---
  if (!(openPrice > 0) || !(stopLoss >= 0) || stopLoss >= openPrice) {
    return { rejected: true, reason: "invalid_stop_loss" };
  }

  // slippage込みの実約定想定価格でリスク・現金の両方を計算する
  const entryFillPrice = round1(openPrice * (1 + entrySlippageBps / 10000));
  const estimatedStopFillPrice = round1(stopLoss * (1 - exitSlippageBps / 10000));
  const perShareRisk = entryFillPrice - estimatedStopFillPrice;

  // --- fail-safe: slippage込みで逆転・ゼロ以下になった場合も現金制約へフォールバックしない ---
  if (perShareRisk <= 0) {
    return { rejected: true, reason: "invalid_stop_loss" };
  }

  const riskBudget = totalAssets * riskPercent;

  // ① 現金残高で買える最大株数（entryFillPrice + commissionベース。20%上限は撤廃済み）
  const cashForShares = cashAvailable - commissionPerTrade;
  const sharesByCash = cashForShares > 0 ? Math.floor(cashForShares / entryFillPrice / lotSize) * lotSize : 0;

  // ② 1取引2%リスク（slippage込み）で買える最大株数
  const sharesByRisk = Math.floor(riskBudget / perShareRisk / lotSize) * lotSize;

  // ③ 100株単位で①②の小さい方を採用
  const shares = Math.min(sharesByCash, sharesByRisk);

  if (shares < lotSize) {
    return { rejected: true, reason: "insufficient_funds_for_minimum_unit", perShareRisk };
  }

  const investedAmount = round1(shares * entryFillPrice) + commissionPerTrade;
  const cashAfterEntry = round1(cashAvailable - investedAmount);

  // fail-safe: 丸め誤差等で万一マイナスになった場合は約定させない
  if (cashAfterEntry < 0) {
    return { rejected: true, reason: "cash_would_go_negative" };
  }

  return { rejected: false, shares, entryFillPrice, investedAmount, cashAfterEntry, perShareRisk };
}
