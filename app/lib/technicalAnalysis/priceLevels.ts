import type { PriceLevels, Signal } from "./types";

export function calculatePriceLevels(
  currentPrice: number,
  support: number,
  resistance: number,
  atr: number,
  signal: Signal
): PriceLevels {
  // サポレジは「ATRより十分広いが、現在値から離れすぎていない（6ATR以内）」場合のみ採用する。
  // 上限を設けないと、直近で急騰・急落した銘柄ではサポレジが現在値から大きく離れ、
  // 損切ラインが現実的でない水準（現在値から数十%）になってしまう。
  const rangeIsUsable =
    resistance > currentPrice &&
    support < currentPrice &&
    resistance - support > atr &&
    resistance - currentPrice <= atr * 6 &&
    currentPrice - support <= atr * 6;

  if (signal === "売り") {
    return {
      entryPrice: currentPrice,
      takeProfit: round1(rangeIsUsable ? support : currentPrice - atr * 2),
      stopLoss: round1(rangeIsUsable ? resistance : currentPrice + atr),
    };
  }

  // 「買い」「待ち」は買い目線のラインを参考値として提示する
  return {
    entryPrice: currentPrice,
    takeProfit: round1(rangeIsUsable ? resistance : currentPrice + atr * 2),
    stopLoss: round1(rangeIsUsable ? support : currentPrice - atr),
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
