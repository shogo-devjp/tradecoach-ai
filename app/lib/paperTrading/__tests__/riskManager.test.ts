import { test } from "node:test";
import assert from "node:assert/strict";
import { canOpenNewPosition, evaluateNewBuyHalt, isAbnormalPriceChange, isValidBar } from "../riskManager";

// テストケース15: 最大3銘柄制限
test("最大保有銘柄数に達している場合はcanOpenNewPositionがfalse", () => {
  assert.equal(canOpenNewPosition(3, 3), false);
  assert.equal(canOpenNewPosition(2, 3), true);
  assert.equal(canOpenNewPosition(0, 3), true);
});

// テストケース14: データ欠損時は新規BUYしない（isValidBar側の検証）
test("null/NaN/欠損を含むbarは無効と判定する", () => {
  assert.equal(isValidBar(null), false);
  assert.equal(isValidBar(undefined), false);
  assert.equal(isValidBar({ open: 100, high: 110, low: 90, close: NaN }), false);
  assert.equal(isValidBar({ open: 100, high: 90, low: 110, close: 100 }), false, "high<lowは不正");
  assert.equal(isValidBar({ open: 100, high: 110, low: 90, close: 100 }), true);
});

test("異常な価格変化（前日比±25%超）を検知する", () => {
  assert.equal(isAbnormalPriceChange(1000, 1300, 0.25), true);
  assert.equal(isAbnormalPriceChange(1000, 1200, 0.25), false);
  assert.equal(isAbnormalPriceChange(0, 1000, 0.25), true, "前日終値が0以下はデータ異常");
});

test("日次最大損失を超えると新規BUYが停止する", () => {
  const result = evaluateNewBuyHalt({
    totalAssetsStartOfDay: 500_000,
    totalAssetsNow: 480_000, // -4%
    peakTotalAssets: 500_000,
    dailyLossLimitPercent: 0.03,
    maxDrawdownHaltPercent: 0.15,
  });
  assert.equal(result.halted, true);
  assert.match(result.reason ?? "", /daily_loss_limit_exceeded/);
});

test("最大ドローダウンを超えると新規BUYが停止する（日次損失は閾値内・ピークからの累積下落が原因のケース）", () => {
  const result = evaluateNewBuyHalt({
    totalAssetsStartOfDay: 420_000, // 前日までに既に下落済み。今日1日の変化は小さい
    totalAssetsNow: 415_000, // 当日の変化は約-1.2%（日次3%閾値内）
    peakTotalAssets: 500_000, // ピーク比では-17%のドローダウン
    dailyLossLimitPercent: 0.03,
    maxDrawdownHaltPercent: 0.15,
  });
  assert.equal(result.halted, true);
  assert.match(result.reason ?? "", /max_drawdown_halt/);
});

test("いずれの閾値も超えなければ新規BUYは継続する", () => {
  const result = evaluateNewBuyHalt({
    totalAssetsStartOfDay: 500_000,
    totalAssetsNow: 495_000,
    peakTotalAssets: 500_000,
    dailyLossLimitPercent: 0.03,
    maxDrawdownHaltPercent: 0.15,
  });
  assert.equal(result.halted, false);
});
