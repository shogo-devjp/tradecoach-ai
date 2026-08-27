import { PAPER_TRADING_CONFIG, type PaperTradingConfig } from "./config";
import type { ExitReason, PositionSide } from "./types";

// スプレッド・スリッページを反映した約定価格を計算する。
// 分析ロジック（priceLevels.ts等）が出す価格はスプレッド・スリッページを含まない「仲値」的な
// 水準のため、実際の売買を模したPaper Tradingでは、ここで初めてコストを反映させる。

// エントリー：LONGはask（仲値+半spread）、SHORTはbid（仲値-半spread）で約定するものとする。
export function applyEntryFill(
  side: PositionSide,
  rawPrice: number,
  config: PaperTradingConfig = PAPER_TRADING_CONFIG
): number {
  const halfSpread = config.spreadJPY / 2;
  return side === "LONG" ? rawPrice + halfSpread : rawPrice - halfSpread;
}

// 決済：エントリーと反対側のレート（LONGの決済はbid、SHORTの決済はask）で半spreadを反映する。
// 往復で1回ぶんのspread（エントリー半分＋決済半分）が発生する計算になる。
// Stop Loss・タイムアウト決済はさらに通常slippage（不利側）を加える。Take Profitには加えない
// （指値的な性質のため、と「成績を実際より良く見せない」ために不利要因は決済側で保守的に扱う）。
export function applyExitFill(
  side: PositionSide,
  rawPrice: number,
  exitReason: ExitReason,
  config: PaperTradingConfig = PAPER_TRADING_CONFIG
): number {
  const halfSpread = config.spreadJPY / 2;
  const base = side === "LONG" ? rawPrice - halfSpread : rawPrice + halfSpread;

  if (exitReason === "TAKE_PROFIT") return base;

  const slippage = config.normalSlippageJPY;
  return side === "LONG" ? base - slippage : base + slippage;
}

// ギャップ（週末・急変）による約定：固定slippageを足すのではなく、実際に観測された価格
// （ギャップを跨いだ後の最初のバーのopen等）をそのまま不利側の約定価格の基準とする。
// ただし決済である以上spread（半分）は通常どおり発生するとみなす。
// 追加の固定slippageは載せない（既に「実際に観測された悪い価格」自体が不利要因を反映しているため）。
export function applyGapExitFill(
  side: PositionSide,
  rawObservedPrice: number,
  config: PaperTradingConfig = PAPER_TRADING_CONFIG
): number {
  const halfSpread = config.spreadJPY / 2;
  return side === "LONG" ? rawObservedPrice - halfSpread : rawObservedPrice + halfSpread;
}
