import type { OHLCBar, OHLCSeries } from "../types";

const HOUR_MS = 60 * 60_000;

// Yahoo Financeは4時間足を直接提供しないため、1時間足を4本ずつ集約して合成する。
// UTC 0,4,8,12,16,20時を境界にグルーピングすることで、一般的なFXチャートの4時間足と
// おおむね一致する区切りにする。
//
// 未確定4時間足問題への対応（重要）：
// この関数に渡す1時間足は、呼び出し側で必ず filterClosedBars() 等により
// 「確定済みバーのみ」に絞り込んでおくこと（この関数自体はバーが確定済みかどうかを
// 判定しない）。その上でこの関数は、4本の1時間足バー（バケット開始時刻から
// 0h/1h/2h/3h後の4本）が「すべて」揃っているバケットだけを1本の4時間足として採用する。
// 1〜3本しか無い形成途中のバケット（区間の最初の数時間しか経っていない、あるいは
// 途中でデータが欠けている場合）は、未確定・不完全な4時間足として結果から除外する。
export function aggregateToFourHour(hourlyBars: OHLCSeries): OHLCSeries {
  if (hourlyBars.length === 0) return [];

  const byTime = new Map<number, OHLCBar>();
  for (const bar of hourlyBars) {
    byTime.set(bar.time, bar);
  }

  const bucketStarts = new Set<number>();
  for (const bar of hourlyBars) {
    const date = new Date(bar.time);
    const bucketHour = Math.floor(date.getUTCHours() / 4) * 4;
    const bucketStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), bucketHour, 0, 0, 0);
    bucketStarts.add(bucketStart);
  }

  const sortedStarts = Array.from(bucketStarts).sort((a, b) => a - b);
  const result: OHLCSeries = [];

  for (const start of sortedStarts) {
    // このバケットに属するべき4本ぶんの時刻（start, start+1h, start+2h, start+3h）が
    // 「すべて」1時間足データに存在するかを厳密にチェックする。1本でも欠けていれば
    // （形成途中・データ欠落のどちらでも）このバケットは不採用にする。
    const expectedTimes = [start, start + HOUR_MS, start + 2 * HOUR_MS, start + 3 * HOUR_MS];
    const bars = expectedTimes.map((t) => byTime.get(t));
    if (bars.some((bar) => bar === undefined)) continue;
    const completeBars = bars as OHLCBar[];

    result.push({
      time: start,
      open: completeBars[0].open,
      high: Math.max(...completeBars.map((b) => b.high)),
      low: Math.min(...completeBars.map((b) => b.low)),
      close: completeBars[3].close,
      tickVolume: completeBars.reduce((sum, b) => sum + (b.tickVolume ?? 0), 0),
    });
  }

  return result;
}
