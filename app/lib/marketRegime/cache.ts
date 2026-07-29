import type { MarketRegime } from "@/app/lib/technicalAnalysis/types";

interface CachedRegime {
  dateKey: string;
  regime: MarketRegime;
}

// プロセスメモリ上のキャッシュ（サーバー再起動で消える）。screening/cache.tsと同じ設計。
// 日経平均・TOPIXは全銘柄で共通の値のため、1日1回だけ取得して使い回す。
let cache: CachedRegime | null = null;

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

export function getCachedMarketRegime(): MarketRegime | null {
  if (cache && cache.dateKey === todayKey()) return cache.regime;
  return null;
}

export function setCachedMarketRegime(regime: MarketRegime): MarketRegime {
  cache = { dateKey: todayKey(), regime };
  return regime;
}
