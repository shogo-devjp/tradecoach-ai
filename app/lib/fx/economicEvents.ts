import type { EconomicEventRisk } from "./types";

// 要件12: 重要経済指標（米国CPI・雇用統計・FOMC・FRB政策金利・日銀会合・日本CPIなど）への
// 対応拡張ポイント。Phase 1ではリアルタイム経済カレンダーを実装せず、常に「リスクなし」を返す
// 固定実装のみ提供する。将来、経済カレンダーAPIと接続してこの関数の中身だけを差し替えれば、
// analyzeFxPair側のロジック（decision.ts）は変更せずに「重要指標30分前は新規エントリーを避ける」
// 等を実装できる。
export function getDefaultEconomicEventRisk(): EconomicEventRisk {
  return {
    isNearHighImpactEvent: false,
    eventName: null,
    minutesUntilEvent: null,
  };
}
