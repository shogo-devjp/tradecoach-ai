// 設計書Rev.4 §7・§8。同日SL/TP到達順序は日足データだけでは判定できないため、
// 「同一日にSL・TP両方へ到達した場合はSLが先に成立したものとして扱う」保守ルールを実装する。
// Gapで飛び越えた場合は指定価格ではなく実際のOpenを基準にする。
//
// 将来ティック・分足等のintradayデータが利用可能になった場合は、この関数の中身だけを
// 実際の到達順序判定に差し替えれば良い（呼び出し側・他モジュールへの影響なし）。

export interface DayBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export type SlTpExitReason = "stop_loss" | "take_profit";

export interface SlTpResolution {
  triggered: boolean;
  reason?: SlTpExitReason;
  referencePrice?: number; // Gap時はOpen、それ以外はSL/TP価格
  gapAdjusted: boolean;
  sameDayConflict: boolean;
}

export function resolveSlTpExit(bar: DayBar, stopLoss: number, takeProfit: number): SlTpResolution {
  const { open, high, low } = bar;

  // Gapで飛び越えて寄り付いた場合は、指定価格ではなく実際のOpenを基準にする。
  if (open <= stopLoss) {
    return { triggered: true, reason: "stop_loss", referencePrice: open, gapAdjusted: true, sameDayConflict: false };
  }
  if (open >= takeProfit) {
    return { triggered: true, reason: "take_profit", referencePrice: open, gapAdjusted: true, sameDayConflict: false };
  }

  const hitSl = low <= stopLoss;
  const hitTp = high >= takeProfit;

  // 保守ルール：同日中に両方到達した場合はSLが先に成立したものとして扱う。
  if (hitSl && hitTp) {
    return { triggered: true, reason: "stop_loss", referencePrice: stopLoss, gapAdjusted: false, sameDayConflict: true };
  }
  if (hitSl) {
    return { triggered: true, reason: "stop_loss", referencePrice: stopLoss, gapAdjusted: false, sameDayConflict: false };
  }
  if (hitTp) {
    return { triggered: true, reason: "take_profit", referencePrice: takeProfit, gapAdjusted: false, sameDayConflict: false };
  }

  return { triggered: false, gapAdjusted: false, sameDayConflict: false };
}
