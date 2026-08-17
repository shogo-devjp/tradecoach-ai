import type { OHLCBar, OHLCSeries } from "../types";

// Yahoo Financeは4時間足を直接提供しないため、1時間足を4本ずつ集約して合成する。
// UTC 0,4,8,12,16,20時を境界にグルーピングすることで、一般的なFXチャートの4時間足と
// おおむね一致する区切りにする。
export function aggregateToFourHour(hourlyBars: OHLCSeries): OHLCSeries {
  if (hourlyBars.length === 0) return [];

  const groups = new Map<number, OHLCBar[]>();
  for (const bar of hourlyBars) {
    const date = new Date(bar.time);
    const bucketHour = Math.floor(date.getUTCHours() / 4) * 4;
    const bucketStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), bucketHour, 0, 0, 0);
    const list = groups.get(bucketStart) ?? [];
    list.push(bar);
    groups.set(bucketStart, list);
  }

  const bucketStarts = Array.from(groups.keys()).sort((a, b) => a - b);
  return bucketStarts.map((start) => {
    const bars = groups.get(start)!.sort((a, b) => a.time - b.time);
    return {
      time: start,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      tickVolume: bars.reduce((sum, b) => sum + (b.tickVolume ?? 0), 0),
    };
  });
}
