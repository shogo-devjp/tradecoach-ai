import type { FxOHLCSeries, FxPairCode, FxTimeframe } from "../types";
import type { FxQuote } from "./types";

// 株式版のキャッシュ（screening/cache.ts, marketRegime/cache.ts）は「1日1回で十分」という
// 前提のJST日付キーだったが、FXは24時間5日間動き続けるため「今日かどうか」という区切りは意味を持たない。
// 代わりに時間足ごとのTTL（有効期限）を設け、その時間内の再アクセスはAPI呼び出しを省略する。
// プロセスメモリ上のキャッシュのため、サーバー再起動で消える（株式版と同じ設計思想）。
const CANDLE_TTL_MS: Record<FxTimeframe, number> = {
  "5m": 60_000,
  "15m": 2 * 60_000,
  "1h": 5 * 60_000,
  "4h": 15 * 60_000,
  "1d": 30 * 60_000,
};
const QUOTE_TTL_MS = 15_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const candleCache = new Map<string, CacheEntry<FxOHLCSeries>>();
const quoteCache = new Map<FxPairCode, CacheEntry<FxQuote>>();

function candleKey(pair: FxPairCode, timeframe: FxTimeframe): string {
  return `${pair}:${timeframe}`;
}

export function getCachedCandles(pair: FxPairCode, timeframe: FxTimeframe): FxOHLCSeries | null {
  const entry = candleCache.get(candleKey(pair, timeframe));
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return null;
}

export function setCachedCandles(pair: FxPairCode, timeframe: FxTimeframe, data: FxOHLCSeries): FxOHLCSeries {
  candleCache.set(candleKey(pair, timeframe), { data, expiresAt: Date.now() + CANDLE_TTL_MS[timeframe] });
  return data;
}

export function getCachedQuote(pair: FxPairCode): FxQuote | null {
  const entry = quoteCache.get(pair);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return null;
}

export function setCachedQuote(pair: FxPairCode, data: FxQuote): FxQuote {
  quoteCache.set(pair, { data, expiresAt: Date.now() + QUOTE_TTL_MS });
  return data;
}
