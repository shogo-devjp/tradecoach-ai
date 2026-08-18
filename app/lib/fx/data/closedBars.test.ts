import { describe, expect, it } from "vitest";
import { filterClosedBars, isBarClosed } from "./closedBars";
import type { OHLCBar } from "../types";

function bar(time: number): OHLCBar {
  return { time, open: 100, high: 101, low: 99, close: 100.5 };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("isBarClosed / filterClosedBars — 5分足", () => {
  const barTime = Date.UTC(2026, 7, 17, 16, 30, 0); // 16:30:00 開始の5分足

  it("形成途中（開始から4分59秒）は未確定", () => {
    const asOf = barTime + 5 * MIN - 1;
    expect(isBarClosed(bar(barTime), asOf, "5m")).toBe(false);
  });

  it("確定直後（開始からちょうど5分）は確定済み", () => {
    const asOf = barTime + 5 * MIN;
    expect(isBarClosed(bar(barTime), asOf, "5m")).toBe(true);
  });
});

describe("isBarClosed / filterClosedBars — 15分足", () => {
  const barTime = Date.UTC(2026, 7, 17, 16, 30, 0);

  it("形成途中（開始から14分59秒）は未確定", () => {
    const asOf = barTime + 15 * MIN - 1;
    expect(isBarClosed(bar(barTime), asOf, "15m")).toBe(false);
  });

  it("確定直後（開始からちょうど15分）は確定済み", () => {
    const asOf = barTime + 15 * MIN;
    expect(isBarClosed(bar(barTime), asOf, "15m")).toBe(true);
  });
});

describe("isBarClosed / filterClosedBars — 1時間足", () => {
  const barTime = Date.UTC(2026, 7, 17, 16, 0, 0);

  it("形成途中（開始から59分59秒）は未確定", () => {
    const asOf = barTime + 60 * MIN - 1;
    expect(isBarClosed(bar(barTime), asOf, "1h")).toBe(false);
  });

  it("確定直後（開始からちょうど1時間）は確定済み", () => {
    const asOf = barTime + 60 * MIN;
    expect(isBarClosed(bar(barTime), asOf, "1h")).toBe(true);
  });

  it("Yahoo Financeが返す「現在進行形のスナップショットバー」（境界に一致しない時刻）も、"
    + "経過時間が足りなければ未確定として除外される", () => {
    // 実データで観測した例: 16:00の1h足の次に 16:40:26 のような半端な時刻のバーが
    // 確定バーと同じ形式で追加される。これは16:40:26時点ではまだ1分も経過していないため
    // 明確に未確定。
    const snapshotBarTime = Date.UTC(2026, 7, 17, 16, 40, 26);
    const asOf = snapshotBarTime; // 取得したその瞬間
    expect(isBarClosed(bar(snapshotBarTime), asOf, "1h")).toBe(false);
  });
});

describe("isBarClosed — 日足（DST安全マージン、決め打ちにしない設計の検証）", () => {
  const barTime = Date.UTC(2026, 6, 5, 23, 0, 0); // 実データ準拠：夏場は23:00 UTC開始

  it("24時間ちょうどでは、まだ確定済みとみなさない（DSTシフトの安全マージン）", () => {
    const asOf = barTime + DAY; // ちょうど24h後
    expect(isBarClosed(bar(barTime), asOf, "1d")).toBe(false);
  });

  it("24時間59分では、まだ確定済みとみなさない", () => {
    const asOf = barTime + DAY + 59 * MIN;
    expect(isBarClosed(bar(barTime), asOf, "1d")).toBe(false);
  });

  it("25時間経過で確定済みとみなす（24h + 1hの安全マージン）", () => {
    const asOf = barTime + DAY + HOUR;
    expect(isBarClosed(bar(barTime), asOf, "1d")).toBe(true);
  });

  it("冬場（00:00 UTC開始）のバーでも同じ基準（25h）で判定される", () => {
    const winterBarTime = Date.UTC(2026, 0, 6, 0, 0, 0); // 実データ準拠：冬場は00:00 UTC開始
    expect(isBarClosed(bar(winterBarTime), winterBarTime + DAY, "1d")).toBe(false);
    expect(isBarClosed(bar(winterBarTime), winterBarTime + DAY + HOUR, "1d")).toBe(true);
  });
});

describe("filterClosedBars — 日付またぎ", () => {
  it("UTC日付をまたぐ5分足でも、経過時間だけで正しく判定される（日付文字列比較に依存しない）", () => {
    const barTime = Date.UTC(2026, 7, 17, 23, 55, 0); // 23:55開始、翌日00:00に確定
    const series = [bar(barTime)];

    expect(filterClosedBars(series, barTime + 5 * MIN - 1, "5m")).toHaveLength(0);
    expect(filterClosedBars(series, barTime + 5 * MIN, "5m")).toHaveLength(1);
  });
});

describe("filterClosedBars — 週末付近（データの間隔が空くケース）", () => {
  it("金曜終値後、月曜まで次のバーが無くても、金曜の確定済みバーはそのまま残る", () => {
    const fridayClose = Date.UTC(2026, 7, 14, 21, 0, 0); // 金曜21:00開始の1h足
    const mondayOpen = Date.UTC(2026, 7, 17, 22, 0, 0); // 月曜22:00開始の1h足（週末で間隔が空く）
    const series = [bar(fridayClose), bar(mondayOpen)];

    // 月曜バーがまだ形成途中の時点でも、金曜バーは確定済みのまま残る
    const asOf = mondayOpen + 30 * MIN;
    const result = filterClosedBars(series, asOf, "1h");
    expect(result.map((b) => b.time)).toEqual([fridayClose]);
  });
});

describe("filterClosedBars — 未来データが1本も混入しないことの網羅確認", () => {
  it("どの足種でも、返されるバーは必ず bar.time + 足の長さ <= asOfTime を満たす", () => {
    const asOf = Date.UTC(2026, 7, 17, 16, 40, 26);

    const timeframeCases: Array<{ timeframe: "5m" | "15m" | "1h" | "1d"; stepMs: number; barDurationMs: number }> = [
      { timeframe: "5m", stepMs: 5 * MIN, barDurationMs: 5 * MIN },
      { timeframe: "15m", stepMs: 15 * MIN, barDurationMs: 15 * MIN },
      { timeframe: "1h", stepMs: HOUR, barDurationMs: HOUR },
      { timeframe: "1d", stepMs: DAY, barDurationMs: 25 * HOUR },
    ];

    for (const { timeframe, stepMs, barDurationMs } of timeframeCases) {
      // asOfのやや未来まで含む、確定済み・未確定が混在する系列を作る
      const series = Array.from({ length: 10 }, (_, i) => bar(asOf - 5 * stepMs + i * stepMs));
      const result = filterClosedBars(series, asOf, timeframe);

      expect(result.length).toBeGreaterThan(0);
      for (const b of result) {
        expect(b.time + barDurationMs).toBeLessThanOrEqual(asOf);
      }
    }
  });
});
