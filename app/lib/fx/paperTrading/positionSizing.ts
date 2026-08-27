import { PAPER_TRADING_CONFIG, type PaperTradingConfig } from "./config";

export interface PositionSizingInput {
  equity: number;
  entryPrice: number;
  stopLoss: number;
}

export interface PositionSizingResult {
  units: number; // 0 = 取引不可（最小ロット未満）
  riskAmountJPY: number;
  stopDistanceJPY: number;
  worstCaseLossPerUnitJPY: number; // SL距離 + spread + 通常slippage
  worstCaseLossJPY: number; // units * worstCaseLossPerUnitJPY（総資産の1%以内であること）
  riskBasedUnits: number;
  leverageCapUnits: number;
  cappedByLeverage: boolean;
  tradable: boolean;
}

// 「SLまでの価格損失だけ」ではなく、spread・通常slippageを含めた最大想定損失が
// 総資産のriskPercentPerTrade以内になるよう数量を逆算する。
// USD/JPYは決済通貨（円）＝口座通貨のため、為替換算なしで
// 「価格1円の変動 = 1通貨あたり1円の損益」としてそのまま計算できる。
export function calculatePositionSize(
  input: PositionSizingInput,
  config: PaperTradingConfig = PAPER_TRADING_CONFIG
): PositionSizingResult {
  const stopDistanceJPY = Math.abs(input.entryPrice - input.stopLoss);
  const worstCaseLossPerUnitJPY = stopDistanceJPY + config.spreadJPY + config.normalSlippageJPY;
  const riskAmountJPY = input.equity * config.riskPercentPerTrade;

  const riskBasedUnits = worstCaseLossPerUnitJPY > 0 ? riskAmountJPY / worstCaseLossPerUnitJPY : 0;
  const leverageCapUnits = (input.equity * config.leverageCapMultiple) / input.entryPrice;

  const rawUnits = Math.min(riskBasedUnits, leverageCapUnits);
  const units = Math.floor(rawUnits / config.minTradableUnit) * config.minTradableUnit;
  const tradable = units >= config.minTradableUnit;

  return {
    units: tradable ? units : 0,
    riskAmountJPY,
    stopDistanceJPY,
    worstCaseLossPerUnitJPY,
    worstCaseLossJPY: tradable ? units * worstCaseLossPerUnitJPY : 0,
    riskBasedUnits,
    leverageCapUnits,
    cappedByLeverage: leverageCapUnits < riskBasedUnits,
    tradable,
  };
}
