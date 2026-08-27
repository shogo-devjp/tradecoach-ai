import type { OHLCSeries } from "../types";
import type { PositionSide } from "./types";

export interface EntryTriggerResult {
  filled: boolean;
  fillRawPrice: number | null; // スプレッド適用前の生値（fills.tsで後段に反映する）
  filledAtBarTime: number | null;
}

// PendingSignalのEntryゾーン（entryLow〜entryHigh）に、監視対象バーの範囲内で
// 一度でも触れたかどうかを判定する。SL/TP監視と同様、単純な「現在値だけの比較」ではなく
// 各バーのHigh/Lowでゾーンとの重なりを見る。
//
// 約定価格の想定：ゾーンのどちら側から触れたかはバー内では分からないため、
// 「ゾーン内で最も不利な価格（LONGはentryHigh、SHORTはentryLow）」で約定したものとみなす
// （＝実際にはもっと有利に約定していたかもしれないが、成績を良く見せない方向に倒す）。
export function checkEntryTrigger(
  side: PositionSide,
  entryLow: number,
  entryHigh: number,
  bars: OHLCSeries
): EntryTriggerResult {
  const sorted = [...bars].sort((a, b) => a.time - b.time);

  for (const bar of sorted) {
    const overlaps = bar.low <= entryHigh && bar.high >= entryLow;
    if (overlaps) {
      const fillRawPrice = side === "LONG" ? entryHigh : entryLow;
      return { filled: true, fillRawPrice, filledAtBarTime: bar.time };
    }
  }

  return { filled: false, fillRawPrice: null, filledAtBarTime: null };
}
