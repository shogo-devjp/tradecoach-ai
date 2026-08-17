import type { CurrencyPairConfig } from "./types";

// 通貨ペアのレジストリ。コード内にペアをベタ書きせず、ここに追加するだけで
// 将来のEUR/JPY・GBP/JPY・AUD/JPY・EUR/USD・GBP/USD対応を拡張できるようにする（要件2・17）。
export const CURRENCY_PAIRS: Record<string, CurrencyPairConfig> = {
  USDJPY: {
    id: "USDJPY",
    base: "USD",
    quoteCurrency: "JPY",
    yahooSymbol: "USDJPY=X",
    displayName: "USD/JPY",
    pipSize: 0.01,
    priceDecimals: 3,
  },
  // Phase 2以降で有効化予定（Phase 1ではUSD/JPYのみサポート）:
  // EURJPY: { id: "EURJPY", base: "EUR", quoteCurrency: "JPY", yahooSymbol: "EURJPY=X", displayName: "EUR/JPY", pipSize: 0.01, priceDecimals: 3 },
  // GBPJPY: { id: "GBPJPY", base: "GBP", quoteCurrency: "JPY", yahooSymbol: "GBPJPY=X", displayName: "GBP/JPY", pipSize: 0.01, priceDecimals: 3 },
  // AUDJPY: { id: "AUDJPY", base: "AUD", quoteCurrency: "JPY", yahooSymbol: "AUDJPY=X", displayName: "AUD/JPY", pipSize: 0.01, priceDecimals: 3 },
  // EURUSD: { id: "EURUSD", base: "EUR", quoteCurrency: "USD", yahooSymbol: "EURUSD=X", displayName: "EUR/USD", pipSize: 0.0001, priceDecimals: 5 },
  // GBPUSD: { id: "GBPUSD", base: "GBP", quoteCurrency: "USD", yahooSymbol: "GBPUSD=X", displayName: "GBP/USD", pipSize: 0.0001, priceDecimals: 5 },
};

// Phase 1で実際にUIから選択可能なペア一覧
export const SUPPORTED_PAIR_IDS = ["USDJPY"] as const;

export function getPairConfig(pairId: string): CurrencyPairConfig {
  const pair = CURRENCY_PAIRS[pairId.toUpperCase()];
  if (!pair) {
    throw new Error(`未対応の通貨ペアです: ${pairId}`);
  }
  return pair;
}
