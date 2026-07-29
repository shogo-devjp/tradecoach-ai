import { NIKKEI225_CODES } from "./nikkei225";

// 今後 TOPIX や米国株を追加する場合は、同じ形の配列を作りここにキーを追加するだけでよい。
// 例: topix.ts を作って TOPIX_CODES をエクスポートし、下の Record に topix: TOPIX_CODES を追加する。
export type UniverseKey = "nikkei225";

export const STOCK_UNIVERSES: Record<UniverseKey, string[]> = {
  nikkei225: NIKKEI225_CODES,
};
