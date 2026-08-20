import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSlTpExit } from "../exitResolver";

const SL = 2920;
const TP = 3200;

// テストケース6: ENTRY当日のSL（保有ポジション共通ロジック）
test("Lowだけ SL を下回った場合、SL到達として扱う（Gapなし）", () => {
  const result = resolveSlTpExit({ open: 3000, high: 3050, low: 2900, close: 2950 }, SL, TP);
  assert.equal(result.triggered, true);
  assert.equal(result.reason, "stop_loss");
  assert.equal(result.referencePrice, SL);
  assert.equal(result.gapAdjusted, false);
  assert.equal(result.sameDayConflict, false);
});

// テストケース6: ENTRY当日のTP
test("Highだけ TP を上回った場合、TP到達として扱う（Gapなし）", () => {
  const result = resolveSlTpExit({ open: 3000, high: 3250, low: 2950, close: 3200 }, SL, TP);
  assert.equal(result.triggered, true);
  assert.equal(result.reason, "take_profit");
  assert.equal(result.referencePrice, TP);
  assert.equal(result.gapAdjusted, false);
});

// テストケース7: SL/TP同時到達→SL優先（保守ルール）
test("同日にSL・TP双方へ到達した場合はSLが先に成立したものとして扱う", () => {
  const result = resolveSlTpExit({ open: 3000, high: 3250, low: 2900, close: 3100 }, SL, TP);
  assert.equal(result.triggered, true);
  assert.equal(result.reason, "stop_loss");
  assert.equal(result.referencePrice, SL);
  assert.equal(result.sameDayConflict, true, "同日競合フラグが立つこと");
  assert.equal(result.gapAdjusted, false);
});

// テストケース8: Gap downによるSL
test("Openが既にSLを割り込んで寄り付いた場合はOpen基準（指定SL価格ではない）", () => {
  const result = resolveSlTpExit({ open: 1820, high: 1850, low: 1800, close: 1810 }, 1900, 2100);
  assert.equal(result.triggered, true);
  assert.equal(result.reason, "stop_loss");
  assert.equal(result.referencePrice, 1820, "SL(1900)ではなく実際のOpen(1820)を基準にする");
  assert.equal(result.gapAdjusted, true);
});

// テストケース9: Gap upによるTP
test("Openが既にTPを上回って寄り付いた場合はOpen基準（指定TP価格ではない）", () => {
  const result = resolveSlTpExit({ open: 3300, high: 3350, low: 3280, close: 3320 }, SL, TP);
  assert.equal(result.triggered, true);
  assert.equal(result.reason, "take_profit");
  assert.equal(result.referencePrice, 3300, "TP(3200)ではなく実際のOpen(3300)を基準にする");
  assert.equal(result.gapAdjusted, true);
});

test("SL/TPいずれにも到達しない場合はtriggered:false", () => {
  const result = resolveSlTpExit({ open: 3000, high: 3050, low: 2950, close: 3010 }, SL, TP);
  assert.equal(result.triggered, false);
});

test("Gap downが優先され、Low側の同日競合判定より先に評価される", () => {
  // Openが既にSLを割り込んでいるケース。High側もTPを超えていても、Gap downのSLを優先する。
  const result = resolveSlTpExit({ open: 2900, high: 3300, low: 2850, close: 2950 }, SL, TP);
  assert.equal(result.reason, "stop_loss");
  assert.equal(result.referencePrice, 2900);
  assert.equal(result.gapAdjusted, true);
  assert.equal(result.sameDayConflict, false, "Gap時はsameDayConflictではなくgapAdjustedとして扱う");
});
