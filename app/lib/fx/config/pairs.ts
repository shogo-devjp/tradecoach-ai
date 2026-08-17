import type { FxPairCode } from "../types";

export interface FxPairDefinition {
  code: FxPairCode;
  // yahoo-finance2 に渡すシンボル（例: USD/JPYは "JPY=X"）
  yahooSymbol: string;
  displayName: string; // "USD/JPY"
  base: string;
  quote: string;
  // 価格の小数点表示桁数（JPYクロスは3桁、それ以外は5桁が一般的）
  priceDecimals: number;
  // 1pipに相当する価格変化幅（JPYクロス=0.01、それ以外=0.0001）
  pipSize: number;
  // Phase1で実際に画面・APIから使えるのはtrueのペアのみ。
  // falseのペアは「将来追加予定」の設計確認用にレジストリへ定義だけ済ませてある。
  enabled: boolean;
}

// 通貨ペアをコード内にベタ書きせず、この一箇所を追加するだけで対応ペアを拡張できるようにする。
// 実際に有効化する（enabled:true にする）際は、config/timeframes.ts のAPI取得可否や
// data/yahooFxProvider.ts のシンボル解決に影響がないことを確認してから切り替えること。
export const FX_PAIRS: Record<FxPairCode, FxPairDefinition> = {
  USDJPY: {
    code: "USDJPY",
    yahooSymbol: "JPY=X",
    displayName: "USD/JPY",
    base: "USD",
    quote: "JPY",
    priceDecimals: 3,
    pipSize: 0.01,
    enabled: true,
  },
  EURJPY: {
    code: "EURJPY",
    yahooSymbol: "EURJPY=X",
    displayName: "EUR/JPY",
    base: "EUR",
    quote: "JPY",
    priceDecimals: 3,
    pipSize: 0.01,
    enabled: false,
  },
  GBPJPY: {
    code: "GBPJPY",
    yahooSymbol: "GBPJPY=X",
    displayName: "GBP/JPY",
    base: "GBP",
    quote: "JPY",
    priceDecimals: 3,
    pipSize: 0.01,
    enabled: false,
  },
  AUDJPY: {
    code: "AUDJPY",
    yahooSymbol: "AUDJPY=X",
    displayName: "AUD/JPY",
    base: "AUD",
    quote: "JPY",
    priceDecimals: 3,
    pipSize: 0.01,
    enabled: false,
  },
  EURUSD: {
    code: "EURUSD",
    yahooSymbol: "EURUSD=X",
    displayName: "EUR/USD",
    base: "EUR",
    quote: "USD",
    priceDecimals: 5,
    pipSize: 0.0001,
    enabled: false,
  },
  GBPUSD: {
    code: "GBPUSD",
    yahooSymbol: "GBPUSD=X",
    displayName: "GBP/USD",
    base: "GBP",
    quote: "USD",
    priceDecimals: 5,
    pipSize: 0.0001,
    enabled: false,
  },
};

export const ENABLED_FX_PAIRS: FxPairDefinition[] = Object.values(FX_PAIRS).filter((p) => p.enabled);

export function getFxPair(code: FxPairCode): FxPairDefinition {
  return FX_PAIRS[code];
}

export function isFxPairEnabled(code: string): code is FxPairCode {
  return code in FX_PAIRS && FX_PAIRS[code as FxPairCode].enabled;
}
