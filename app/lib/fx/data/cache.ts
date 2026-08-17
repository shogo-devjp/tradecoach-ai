import type { FxAnalysisResult } from "../types";

interface CacheEntry {
  result: FxAnalysisResult;
  fetchedAt: number;
}

// プロセスメモリ上のキャッシュ（サーバー再起動で消える）。app/lib/marketRegime/cache.ts と
// 同じ設計だが、FXは値動きが速いため「今日1回」ではなく短いTTL（秒単位）で管理する。
// 個人利用でYahoo Financeへの呼び出し回数を抑えつつ、5分足の更新頻度と大きくズレない範囲にする。
const TTL_MS = 30_000;

const cache = new Map<string, CacheEntry>();

export function getCachedFxAnalysis(pairId: string): FxAnalysisResult | null {
  const entry = cache.get(pairId);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) return null;
  return entry.result;
}

export function setCachedFxAnalysis(pairId: string, result: FxAnalysisResult): FxAnalysisResult {
  cache.set(pairId, { result, fetchedAt: Date.now() });
  return result;
}
