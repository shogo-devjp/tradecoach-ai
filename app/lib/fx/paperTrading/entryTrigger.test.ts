import { describe, expect, it } from "vitest";
import { checkEntryTrigger } from "./entryTrigger";
import type { OHLCBar } from "../types";

function bar(time: number, open: number, high: number, low: number, close: number): OHLCBar {
  return { time, open, high, low, close };
}

describe("checkEntryTrigger", () => {
  it("LONG: バーの安値がEntryゾーンに触れたら成立し、ゾーン内の不利な側(entryHigh)で約定する", () => {
    const bars = [bar(1000, 159.35, 159.36, 159.28, 159.3)]; // ゾーン(159.28〜159.32)に触れている
    const result = checkEntryTrigger("LONG", 159.28, 159.32, bars);
    expect(result.filled).toBe(true);
    expect(result.fillRawPrice).toBe(159.32);
  });

  it("SHORT: ゾーンに触れたら成立し、entryLow（不利な側）で約定する", () => {
    const bars = [bar(1000, 159.3, 159.34, 159.29, 159.31)];
    const result = checkEntryTrigger("SHORT", 159.28, 159.32, bars);
    expect(result.filled).toBe(true);
    expect(result.fillRawPrice).toBe(159.28);
  });

  it("ゾーンに一度も触れなければ不成立", () => {
    const bars = [bar(1000, 159.5, 159.55, 159.45, 159.5)];
    const result = checkEntryTrigger("LONG", 159.28, 159.32, bars);
    expect(result.filled).toBe(false);
    expect(result.fillRawPrice).toBeNull();
  });

  it("複数バーのうち最初に触れたバーで成立する", () => {
    const bars = [
      bar(2000, 159.5, 159.55, 159.45, 159.5), // 触れない
      bar(1000, 159.3, 159.33, 159.27, 159.3), // 触れる（時刻は2000より前）
    ];
    const result = checkEntryTrigger("LONG", 159.28, 159.32, bars);
    expect(result.filled).toBe(true);
    expect(result.filledAtBarTime).toBe(1000);
  });
});
