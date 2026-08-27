import { describe, expect, it } from "vitest";
import { evaluatePositionExit } from "./tradeOutcome";
import type { OHLCBar } from "../types";

function bar(time: number, open: number, high: number, low: number, close: number): OHLCBar {
  return { time, open, high, low, close };
}

const farFuture = Date.UTC(2099, 0, 1); // maxHoldUntilに引っかからないよう十分未来に設定

describe("evaluatePositionExit — LONG", () => {
  const stopLoss = 159.0;
  const takeProfit1 = 159.6;

  it("監視間隔中に一瞬だけSLに触れた場合も検出できる（現在値だけの比較では見逃すケース）", () => {
    // このバーの終値は159.3だが、安値は一瞬SLの159.0を割り込んでいる
    const bars = [bar(Date.UTC(2026, 7, 17, 10, 0), 159.3, 159.35, 158.95, 159.3)];
    const result = evaluatePositionExit("LONG", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exited).toBe(true);
    expect(result.exitReason).toBe("STOP_LOSS");
    expect(result.rawExitPrice).toBe(stopLoss);
    expect(result.isGap).toBe(false);
  });

  it("監視間隔中に一瞬だけTPに触れた場合も検出できる", () => {
    const bars = [bar(Date.UTC(2026, 7, 17, 10, 0), 159.3, 159.65, 159.25, 159.3)];
    const result = evaluatePositionExit("LONG", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exited).toBe(true);
    expect(result.exitReason).toBe("TAKE_PROFIT");
    expect(result.rawExitPrice).toBe(takeProfit1);
  });

  it("同一バー内でSL・TP両方に到達した場合はSL優先（保守的判定）", () => {
    const bars = [bar(Date.UTC(2026, 7, 17, 10, 0), 159.3, 159.7, 158.9, 159.5)];
    const result = evaluatePositionExit("LONG", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exited).toBe(true);
    expect(result.exitReason).toBe("STOP_LOSS");
  });

  it("複数バーのうち先に到達した方（時系列順）が優先される", () => {
    const bars = [
      bar(Date.UTC(2026, 7, 17, 10, 0), 159.3, 159.35, 159.25, 159.3), // 何も無し
      bar(Date.UTC(2026, 7, 17, 10, 5), 159.3, 159.65, 159.25, 159.6), // TP到達
      bar(Date.UTC(2026, 7, 17, 10, 10), 159.6, 159.62, 158.5, 159.0), // その後SLも到達（無視されるべき）
    ];
    const result = evaluatePositionExit("LONG", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 10, 15));
    expect(result.exitReason).toBe("TAKE_PROFIT");
    expect(result.exitBarTime).toBe(Date.UTC(2026, 7, 17, 10, 5));
  });

  it("週末ギャップ等でバーのopen時点で既にSLを飛び越えている場合、固定slippageではなく実観測価格(open)で決済する", () => {
    // 月曜の窓開けでSL(159.0)を大きく割り込んだopen=158.5から始まるケース
    const bars = [bar(Date.UTC(2026, 7, 17, 22, 0), 158.5, 158.6, 158.3, 158.4)];
    const result = evaluatePositionExit("LONG", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 22, 5));
    expect(result.exited).toBe(true);
    expect(result.exitReason).toBe("STOP_LOSS");
    expect(result.isGap).toBe(true);
    expect(result.rawExitPrice).toBe(158.5); // SL(159.0)ではなく実際のopen価格
  });

  it("最大保有期間を超過し、かつ他に決済条件が無い場合はタイムアウト決済（直近close使用）", () => {
    const maxHoldUntil = Date.UTC(2026, 7, 17, 10, 0);
    const bars = [bar(Date.UTC(2026, 7, 17, 9, 55), 159.3, 159.35, 159.2, 159.25)];
    const result = evaluatePositionExit("LONG", stopLoss, takeProfit1, bars, maxHoldUntil, Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exited).toBe(true);
    expect(result.exitReason).toBe("TIMEOUT");
    expect(result.rawExitPrice).toBe(159.25);
  });

  it("バーが1本も無い場合は決済しない（価格が分からないため次回に持ち越す）", () => {
    const result = evaluatePositionExit("LONG", stopLoss, takeProfit1, [], Date.UTC(2000, 0, 1), Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exited).toBe(false);
  });

  it("何も条件を満たさなければ決済しない", () => {
    const bars = [bar(Date.UTC(2026, 7, 17, 10, 0), 159.3, 159.35, 159.25, 159.3)];
    const result = evaluatePositionExit("LONG", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exited).toBe(false);
  });
});

describe("evaluatePositionExit — SHORT（LONGと左右対称になっているか）", () => {
  const stopLoss = 159.6;
  const takeProfit1 = 159.0;

  it("高値がSLに触れたら決済", () => {
    const bars = [bar(Date.UTC(2026, 7, 17, 10, 0), 159.3, 159.65, 159.25, 159.3)];
    const result = evaluatePositionExit("SHORT", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exitReason).toBe("STOP_LOSS");
  });

  it("安値がTPに触れたら決済", () => {
    const bars = [bar(Date.UTC(2026, 7, 17, 10, 0), 159.3, 159.35, 158.95, 159.3)];
    const result = evaluatePositionExit("SHORT", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exitReason).toBe("TAKE_PROFIT");
  });

  it("同一バーでSL・TP両方到達時はSL優先", () => {
    const bars = [bar(Date.UTC(2026, 7, 17, 10, 0), 159.3, 159.7, 158.9, 159.1)];
    const result = evaluatePositionExit("SHORT", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 10, 5));
    expect(result.exitReason).toBe("STOP_LOSS");
  });

  it("ギャップでopenが既にSLを飛び越えている場合は実観測価格で決済", () => {
    const bars = [bar(Date.UTC(2026, 7, 17, 22, 0), 160.5, 160.6, 160.3, 160.4)];
    const result = evaluatePositionExit("SHORT", stopLoss, takeProfit1, bars, farFuture, Date.UTC(2026, 7, 17, 22, 5));
    expect(result.isGap).toBe(true);
    expect(result.rawExitPrice).toBe(160.5);
  });
});
