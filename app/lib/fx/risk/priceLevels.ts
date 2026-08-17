import type { CurrencyPairConfig, FxPriceLevels } from "../types";
import { FX_CONFIG } from "../config";

export type TentativeDirection = "buy" | "sell" | "none";

interface PriceLevelInputs {
  currentPrice: number;
  atr: number;
  support: number | null;
  resistance: number | null;
  direction: TentativeDirection;
  pair: CurrencyPairConfig;
}

// Entry/StopLoss/TakeProfitは固定pipsではなく、ATRとサポート・レジスタンス（直近高値安値）を
// 使って動的に計算する（要件9）。サポート・レジスタンスがATRに対して現実的な距離にある場合は
// それを優先し、そうでない場合はATR倍率にフォールバックする。
export function calculatePriceLevels(inputs: PriceLevelInputs): FxPriceLevels {
  const { currentPrice, atr, support, resistance, direction, pair } = inputs;
  const cfg = FX_CONFIG.priceLevels;
  const round = (value: number) => roundToPip(value, pair);

  if (direction === "sell") {
    const srStop = resistance !== null && isUsableStop(resistance, currentPrice, atr) ? resistance : null;
    const srTp1 = support !== null && isUsableTarget(support, currentPrice, atr) ? support : null;

    const stopLoss = srStop ?? currentPrice + atr * cfg.stopLossAtrMultiple;
    const takeProfit1 = srTp1 ?? currentPrice - atr * cfg.takeProfit1AtrMultiple;
    const takeProfit2 = currentPrice - atr * cfg.takeProfit2AtrMultiple;

    return {
      entryLow: round(currentPrice),
      entryHigh: round(currentPrice + atr * cfg.entryZoneAtrMultiple),
      stopLoss: round(stopLoss),
      takeProfit1: round(takeProfit1),
      takeProfit2: round(Math.min(takeProfit2, takeProfit1)),
    };
  }

  // direction === "buy" | "none"（"none"の場合も買い目線を参考値として提示する。
  // 最終的にWAITになるかはdecision.ts側の判定で決まる）
  const srStop = support !== null && isUsableStop(support, currentPrice, atr) ? support : null;
  const srTp1 = resistance !== null && isUsableTarget(resistance, currentPrice, atr) ? resistance : null;

  const stopLoss = srStop ?? currentPrice - atr * cfg.stopLossAtrMultiple;
  const takeProfit1 = srTp1 ?? currentPrice + atr * cfg.takeProfit1AtrMultiple;
  const takeProfit2 = currentPrice + atr * cfg.takeProfit2AtrMultiple;

  return {
    entryLow: round(currentPrice - atr * cfg.entryZoneAtrMultiple),
    entryHigh: round(currentPrice),
    stopLoss: round(stopLoss),
    takeProfit1: round(takeProfit1),
    takeProfit2: round(Math.max(takeProfit2, takeProfit1)),
  };
}

// サポレジを損切り水準として使うのは、ATRの0.5〜3倍以内に収まっている現実的な距離のときだけにする
// （離れすぎたサポレジを使うと損切り幅が不自然に広くなるため）
function isUsableStop(level: number, currentPrice: number, atr: number): boolean {
  const distance = Math.abs(currentPrice - level);
  return distance > atr * 0.5 && distance <= atr * 3;
}

function isUsableTarget(level: number, currentPrice: number, atr: number): boolean {
  const distance = Math.abs(currentPrice - level);
  return distance > atr * 0.5 && distance <= atr * 5;
}

function roundToPip(value: number, pair: CurrencyPairConfig): number {
  const factor = 10 ** pair.priceDecimals;
  return Math.round(value * factor) / factor;
}
