import type { FxPriceLevels, TimeframeAnalysis } from "../types";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface PriceLevelInputs {
  currentPrice: number;
  // stop距離の基準は1時間足のATR（現在のトレンドに近い時間軸のボラティリティ）
  atr: number;
  // 節目の基準は4時間足のサポート・レジスタンス（中期的に意味のある水準）
  srTimeframe: TimeframeAnalysis | null;
  direction: "BUY" | "SELL";
  priceDecimals: number;
}

// Entry/Stop Loss/Take Profitは固定pipsではなく、ATRとサポート・レジスタンスから動的に算出する（要件9）。
export function calculateFxPriceLevels(inputs: PriceLevelInputs): FxPriceLevels {
  const { currentPrice, atr, srTimeframe, direction, priceDecimals } = inputs;
  const support = srTimeframe?.indicators.support ?? null;
  const resistance = srTimeframe?.indicators.resistance ?? null;

  // サポレジは「ATRより十分広いが現在値から離れすぎていない(6ATR以内)」場合のみ採用する
  // （直近で急騰・急落した場合にサポレジが現在値から大きく離れ、損切ラインが非現実的にならないようにする）
  const rangeIsUsable =
    support !== null &&
    resistance !== null &&
    resistance > currentPrice &&
    support < currentPrice &&
    resistance - support > atr &&
    resistance - currentPrice <= atr * 6 &&
    currentPrice - support <= atr * 6;

  if (direction === "SELL") {
    // 戻り売り：現在値からわずかに戻ったところまでを許容エントリー帯とする
    const stopLoss = rangeIsUsable ? resistance! + atr * 0.3 : currentPrice + atr * 1.5;
    const takeProfit1 = rangeIsUsable ? support! : currentPrice - atr * 2;
    const takeProfit2 = rangeIsUsable ? support! - (resistance! - support!) * 0.5 : currentPrice - atr * 3.5;
    return {
      entryLow: round(currentPrice, priceDecimals),
      entryHigh: round(currentPrice + atr * 0.3, priceDecimals),
      stopLoss: round(stopLoss, priceDecimals),
      takeProfit1: round(takeProfit1, priceDecimals),
      takeProfit2: round(takeProfit2, priceDecimals),
    };
  }

  // 押し目買い：現在値からわずかに下げたところまでを許容エントリー帯とする
  const stopLoss = rangeIsUsable ? support! - atr * 0.3 : currentPrice - atr * 1.5;
  const takeProfit1 = rangeIsUsable ? resistance! : currentPrice + atr * 2;
  const takeProfit2 = rangeIsUsable ? resistance! + (resistance! - support!) * 0.5 : currentPrice + atr * 3.5;
  return {
    entryLow: round(currentPrice - atr * 0.3, priceDecimals),
    entryHigh: round(currentPrice, priceDecimals),
    stopLoss: round(stopLoss, priceDecimals),
    takeProfit1: round(takeProfit1, priceDecimals),
    takeProfit2: round(takeProfit2, priceDecimals),
  };
}
