import type { FxPairDefinition } from "../config/pairs";
import type { FxOHLCSeries, FxTimeframe } from "../types";

export interface FxQuote {
  price: number;
  time: number; // UNIX seconds
}

// データ取得元を差し替え可能にするためのインターフェース。
// Phase 1ではYahoo Finance実装（yahooFxProvider.ts）のみを使うが、
// 将来Twelve Data等の有料/別無料APIに切り替える場合もこのインターフェースだけ実装すればよい。
export interface FxDataProvider {
  getQuote(pairDef: FxPairDefinition): Promise<FxQuote>;
  getCandles(pairDef: FxPairDefinition, timeframe: FxTimeframe): Promise<FxOHLCSeries>;
}
