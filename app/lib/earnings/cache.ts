import type { EarningsInfo } from "./types";

interface CachedEntry {
  info: EarningsInfo;
  fetchedAt: number; // Date.now()
}

// 決算発表日は数日単位でしか変わらないため、marketRegime/cache.tsの「1日1回」より長め
// （既定4日）のTTLでプロセスメモリ上にキャッシュし、Yahoo Financeへのリクエスト数を抑える。
// サーバー再起動でクリアされる点はmarketRegime/screeningのキャッシュと同じ設計。
const TTL_MS = 4 * 24 * 60 * 60 * 1000;

const cache = new Map<string, CachedEntry>();

export function getCachedEarnings(code: string): EarningsInfo | null {
  const entry = cache.get(code);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) return null;
  return entry.info;
}

export function setCachedEarnings(code: string, info: EarningsInfo): EarningsInfo {
  cache.set(code, { info, fetchedAt: Date.now() });
  return info;
}
