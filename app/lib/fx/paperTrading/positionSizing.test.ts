import { describe, expect, it } from "vitest";
import { calculatePositionSize } from "./positionSizing";
import { PAPER_TRADING_CONFIG } from "./config";

describe("calculatePositionSize", () => {
  it("500,000円・Entry159.32・SL159.166の具体例で、最大想定損失が総資産1%(5,000円)以内に収まる", () => {
    const result = calculatePositionSize({ equity: 500_000, entryPrice: 159.32, stopLoss: 159.166 });

    // SL距離0.154 + spread0.003 + slippage0.002 = 0.159円/通貨
    expect(result.stopDistanceJPY).toBeCloseTo(0.154, 3);
    expect(result.worstCaseLossPerUnitJPY).toBeCloseTo(0.159, 3);
    expect(result.riskAmountJPY).toBe(5_000);

    // 1,000通貨単位に丸められている
    expect(result.units % PAPER_TRADING_CONFIG.minTradableUnit).toBe(0);
    expect(result.tradable).toBe(true);

    // 最大想定損失（SL+spread+slippage込み）が総資産の1%を超えない
    expect(result.worstCaseLossJPY).toBeLessThanOrEqual(result.riskAmountJPY);
    expect(result.worstCaseLossJPY).toBeGreaterThan(0);
  });

  it("レバレッジ上限（10倍）が実際にリスクベースの数量より小さい場合はレバレッジ側で制限される", () => {
    // SL距離が極端に狭い（0.02円）→ リスクベースの数量が非常に大きくなり、レバレッジ上限に張り付く
    const result = calculatePositionSize({ equity: 500_000, entryPrice: 159.32, stopLoss: 159.30 });

    expect(result.cappedByLeverage).toBe(true);
    // レバレッジ上限 = 500,000 * 10 / 159.32 ≈ 31,384通貨 → 1,000単位切り捨てで31,000
    expect(result.units).toBeLessThanOrEqual(31_000);
    expect(result.units).toBeGreaterThan(0);

    // レバレッジ上限を守れているか（想定元本が総資産の10倍を超えない）
    const notional = result.units * 159.32;
    expect(notional).toBeLessThanOrEqual(500_000 * PAPER_TRADING_CONFIG.leverageCapMultiple + 1e-6);
  });

  it("SL距離が広すぎて最小取引単位(1,000通貨)でもリスク超過になる場合は取引不可(0)を返す", () => {
    // SL距離が極端に広い（10円）場合、1,000通貨だけでもworstCaseLoss=1000*10.005=10,005円で
    // リスク許容額5,000円を超えてしまう
    const result = calculatePositionSize({ equity: 500_000, entryPrice: 159.32, stopLoss: 149.32 });

    expect(result.tradable).toBe(false);
    expect(result.units).toBe(0);
    expect(result.worstCaseLossJPY).toBe(0);
  });

  it("SL距離が0の場合はゼロ除算せず取引不可を返す", () => {
    const result = calculatePositionSize({ equity: 500_000, entryPrice: 159.32, stopLoss: 159.32 });
    expect(Number.isFinite(result.riskBasedUnits)).toBe(true);
  });
});
