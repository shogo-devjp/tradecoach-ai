import type { FxOHLCSeries } from "../types";

// Yahoo Financeは4時間足を直接提供していないため、60分足を合成して作る。
// UNIX秒はUTC 0時起点なので、bucketSeconds単位で切り捨てるだけで
// UTC 00:00/04:00/08:00...の境界に自動的に揃う（タイムゾーン変換が不要）。
export function resampleToHours(source: FxOHLCSeries, hours: number): FxOHLCSeries {
  const bucketSeconds = hours * 60 * 60;

  interface Bucket {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volumeSum: number;
    volumeCount: number;
  }

  const buckets = new Map<number, Bucket>();

  for (let i = 0; i < source.times.length; i++) {
    const bucketKey = Math.floor(source.times[i] / bucketSeconds) * bucketSeconds;
    const existing = buckets.get(bucketKey);
    const volume = source.tickVolumes[i];

    if (!existing) {
      buckets.set(bucketKey, {
        time: bucketKey,
        open: source.opens[i],
        high: source.highs[i],
        low: source.lows[i],
        close: source.closes[i],
        volumeSum: volume ?? 0,
        volumeCount: volume !== null ? 1 : 0,
      });
      continue;
    }

    existing.high = Math.max(existing.high, source.highs[i]);
    existing.low = Math.min(existing.low, source.lows[i]);
    existing.close = source.closes[i];
    if (volume !== null) {
      existing.volumeSum += volume;
      existing.volumeCount += 1;
    }
  }

  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
  const result: FxOHLCSeries = { times: [], opens: [], highs: [], lows: [], closes: [], tickVolumes: [] };

  for (const key of sortedKeys) {
    const bucket = buckets.get(key)!;
    result.times.push(bucket.time);
    result.opens.push(bucket.open);
    result.highs.push(bucket.high);
    result.lows.push(bucket.low);
    result.closes.push(bucket.close);
    result.tickVolumes.push(bucket.volumeCount > 0 ? bucket.volumeSum : null);
  }

  return result;
}
