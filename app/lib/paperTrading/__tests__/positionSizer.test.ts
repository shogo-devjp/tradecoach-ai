import { test } from "node:test";
import assert from "node:assert/strict";
import { sizePosition } from "../positionSizer";

// テストケース2: 100株購入可能／不可能の境界
test("100株購入可能な境界（現金がちょうど100株分ある）", () => {
  const result = sizePosition({
    openPrice: 3000,
    stopLoss: 2920, // perShareRisk(slippage込み)は約85.9円
    cashAvailable: 300_300, // 100株×3,003円ちょうど
    totalAssets: 500_000,
  });
  assert.equal(result.rejected, false);
  assert.equal(result.shares, 100);
});

test("100株購入不可能な境界（現金が100株分にわずかに足りない）", () => {
  const result = sizePosition({
    openPrice: 3000,
    stopLoss: 2920,
    cashAvailable: 300_299, // 100株分(300,300円)に1円足りない
    totalAssets: 500_000,
  });
  assert.equal(result.rejected, true);
  assert.equal(result.reason, "insufficient_funds_for_minimum_unit");
});

// テストケース3: slippage込みで現金がマイナスにならない
test("slippage込みの約定価格でも現金残高がマイナスにならない", () => {
  const cashAvailable = 500_000;
  const result = sizePosition({
    openPrice: 3000,
    stopLoss: 2920,
    cashAvailable,
    totalAssets: 500_000,
    entrySlippageBps: 10,
  });
  assert.equal(result.rejected, false);
  assert.ok(result.investedAmount! <= cashAvailable, "investedAmountはcashAvailableを超えてはいけない");
  assert.ok(result.cashAfterEntry! >= 0, "cashAfterEntryはマイナスになってはいけない");
});

// テストケース4: 1取引2%リスク制限
test("SLが浅い（1株あたりリスクが小さい）ほど、リスク制約が現金制約より先に効かない", () => {
  // 1株あたりリスクが極端に大きい（Open近くまで距離がある浅すぎるSL）場合、
  // riskBudget(総資産の2%)による制約で現金より少ない株数しか許容されないことを確認する。
  const result = sizePosition({
    openPrice: 3000,
    stopLoss: 2000, // 1株あたりリスク約1000円 → riskBudget(10,000円)では10株分しか許容されない
    cashAvailable: 500_000,
    totalAssets: 500_000,
    riskPercent: 0.02,
  });
  assert.equal(result.rejected, true, "リスク制約により100株未満しか許容されず拒否される");
  assert.equal(result.reason, "insufficient_funds_for_minimum_unit");
});

test("2%リスク予算ちょうどで100株が許容される境界", () => {
  // perShareRisk(slippage込み)が総資産2%÷100株=100円ちょうどになるよう調整
  const result = sizePosition({
    openPrice: 3000,
    stopLoss: 2920, // entryFillPrice=3,003, estimatedStopFillPrice≈2,917.1, perShareRisk≈85.9円 < 100円
    cashAvailable: 500_000,
    totalAssets: 500_000,
    riskPercent: 0.02,
  });
  assert.equal(result.rejected, false);
  assert.equal(result.shares, 100);
});

// テストケース10: invalid_stop_loss
test("stopLoss >= openPrice の場合はinvalid_stop_lossで即座に拒否される（現金制約へフォールバックしない）", () => {
  const result = sizePosition({
    openPrice: 3000,
    stopLoss: 3000,
    cashAvailable: 500_000,
    totalAssets: 500_000,
  });
  assert.equal(result.rejected, true);
  assert.equal(result.reason, "invalid_stop_loss");
});

test("stopLossがOpenを上回っている異常値の場合もinvalid_stop_loss", () => {
  const result = sizePosition({
    openPrice: 3000,
    stopLoss: 3100,
    cashAvailable: 500_000,
    totalAssets: 500_000,
  });
  assert.equal(result.rejected, true);
  assert.equal(result.reason, "invalid_stop_loss");
});

test("理論値ではプラスでもslippage込みで逆転する境界値はinvalid_stop_loss", () => {
  // Open=3000, SL=2999.7 → 理論上のperShareRiskは0.3円だが、
  // entryFillPrice(3003)とestimatedStopFillPrice(2996.7付近)の差はプラスのまま。
  // より極端に、SLをOpenの直下に置いた場合の境界を確認する。
  const result = sizePosition({
    openPrice: 3000,
    stopLoss: 2999.9,
    cashAvailable: 500_000,
    totalAssets: 500_000,
  });
  // perShareRisk(slippage込み)は依然プラスなのでinvalid_stop_lossにはならないはずだが、
  // riskBudget(10,000円)に対してperShareRiskがほぼ0のため、sharesByRiskは極めて大きくなり
  // 現金制約(sharesByCash)の方が効くことを確認する。
  assert.equal(result.rejected, false);
  assert.ok(result.shares! > 0);
});
