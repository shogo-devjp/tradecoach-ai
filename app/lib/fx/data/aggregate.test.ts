import { describe, expect, it } from "vitest";
import { aggregateToFourHour } from "./aggregate";
import type { OHLCBar } from "../types";

const HOUR = 60 * 60_000;

function hourBar(time: number, open: number, high: number, low: number, close: number): OHLCBar {
  return { time, open, high, low, close };
}

describe("aggregateToFourHour — 未確定4時間足の除外", () => {
  // UTC 16:00-20:00 の4時間バケット（16,17,18,19時の1h足4本で構成される）
  const bucketStart = Date.UTC(2026, 7, 17, 16, 0, 0);

  it("4h開始直後：1本しか無い場合は結果に含まれない", () => {
    const hourly = [hourBar(bucketStart, 159.0, 159.2, 158.9, 159.1)];
    const result = aggregateToFourHour(hourly);
    expect(result).toHaveLength(0);
  });

  it("4h途中：2〜3本しか無い場合も結果に含まれない", () => {
    const hourly = [
      hourBar(bucketStart, 159.0, 159.2, 158.9, 159.1),
      hourBar(bucketStart + HOUR, 159.1, 159.3, 159.0, 159.2),
      hourBar(bucketStart + 2 * HOUR, 159.2, 159.4, 159.1, 159.3),
    ];
    const result = aggregateToFourHour(hourly);
    expect(result).toHaveLength(0);
  });

  it("4h確定直後：4本すべて揃うと1本の4時間足として採用され、OHLCが正しく集約される", () => {
    const hourly = [
      hourBar(bucketStart, 159.0, 159.2, 158.8, 159.1), // open候補
      hourBar(bucketStart + HOUR, 159.1, 159.5, 159.0, 159.2), // high候補
      hourBar(bucketStart + 2 * HOUR, 159.2, 159.3, 158.7, 159.25), // low候補
      hourBar(bucketStart + 3 * HOUR, 159.25, 159.4, 159.1, 159.35), // close候補
    ];
    const result = aggregateToFourHour(hourly);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      time: bucketStart,
      open: 159.0,
      high: 159.5,
      low: 158.7,
      close: 159.35,
      tickVolume: 0,
    });
  });

  it("複数バケットが混在する場合、揃っているバケットだけが採用される（直近＝形成中のバケットは除外）", () => {
    const prevBucketStart = bucketStart - 4 * HOUR;
    const hourly = [
      // 1つ前のバケット：4本すべて揃っている → 採用されるべき
      hourBar(prevBucketStart, 158.8, 158.9, 158.7, 158.85),
      hourBar(prevBucketStart + HOUR, 158.85, 158.95, 158.75, 158.9),
      hourBar(prevBucketStart + 2 * HOUR, 158.9, 159.0, 158.8, 158.95),
      hourBar(prevBucketStart + 3 * HOUR, 158.95, 159.05, 158.85, 159.0),
      // 直近バケット：2本しかない（形成途中）→ 除外されるべき
      hourBar(bucketStart, 159.0, 159.2, 158.9, 159.1),
      hourBar(bucketStart + HOUR, 159.1, 159.3, 159.0, 159.2),
    ];
    const result = aggregateToFourHour(hourly);
    expect(result.map((b) => b.time)).toEqual([prevBucketStart]);
  });
});

describe("aggregateToFourHour — 週末付近のギャップ", () => {
  it("週末で1時間足データが途切れていても、揃っているバケットは正しく採用される", () => {
    // 金曜21:00-22:00の1本だけが週末直前に存在し、次のバケットは月曜まで存在しない
    const fridayBucketStart = Date.UTC(2026, 7, 14, 20, 0, 0); // 20-24時のバケット
    const hourly = [
      hourBar(fridayBucketStart, 159.0, 159.1, 158.9, 159.0),
      hourBar(fridayBucketStart + HOUR, 159.0, 159.1, 158.9, 159.0),
      hourBar(fridayBucketStart + 2 * HOUR, 159.0, 159.1, 158.9, 159.0),
      // 3本目（23時）が欠落＝週末クローズで途切れているケースを想定
    ];
    const result = aggregateToFourHour(hourly);
    expect(result).toHaveLength(0); // 揃っていないので除外（クラッシュしないことも確認）
  });

  it("空配列を渡してもクラッシュしない", () => {
    expect(aggregateToFourHour([])).toEqual([]);
  });
});
