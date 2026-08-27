import type { OHLCSeries } from "../types";
import type { ExitReason, PositionSide } from "./types";

export interface ExitEvaluation {
  exited: boolean;
  exitReason: ExitReason | null;
  rawExitPrice: number | null; // スプレッド・スリッページ適用前の生値（fills.tsで反映する）
  isGap: boolean; // true = ギャップ（バーのopen時点で既にSLを飛び越えていた）による決済
  exitBarTime: number | null;
}

const NOT_EXITED: ExitEvaluation = { exited: false, exitReason: null, rawExitPrice: null, isGap: false, exitBarTime: null };

// 前回監視時刻〜現在までに確定したバー（呼び出し側で filterClosedBars 済みのものを渡す）を
// 古い順に1本ずつ検証し、SL/TP/タイムアウトのいずれかに該当したら決済とする。
//
// 「5〜15分ごとの現在価格だけを比較」ではなく、各バーのHigh/Lowで判定するため、
// 監視間隔の途中で一瞬だけ到達したSL/TPも検出できる。
//
// 同一バー内でSL・TPの両方に到達しうる場合は、価格の到達順序が分からないため
// 保守的にSL優先とする（株式版Paper Tradingと同じ方針）。
//
// 週末ギャップ・急変時は、バーのopen時点で既にSLを飛び越えている場合に限り、
// 固定slippageではなく「実際に観測されたそのバーのopen価格」で不利側に約定したものとして扱う。
export function evaluatePositionExit(
  side: PositionSide,
  stopLoss: number,
  takeProfit1: number,
  bars: OHLCSeries,
  maxHoldUntil: number,
  now: number
): ExitEvaluation {
  const sorted = [...bars].sort((a, b) => a.time - b.time);

  for (const bar of sorted) {
    // ① ギャップ判定：バーが始まった時点（open）で、既にSLを飛び越えているか。
    // 通常のslippage想定を超える不利な状況のため、実際に観測された価格をそのまま使う。
    const gappedThroughStop = side === "LONG" ? bar.open <= stopLoss : bar.open >= stopLoss;
    if (gappedThroughStop) {
      return {
        exited: true,
        exitReason: "STOP_LOSS",
        rawExitPrice: bar.open,
        isGap: true,
        exitBarTime: bar.time,
      };
    }

    // ② 通常のバー内到達判定（High/Lowで判定、同一バー内はSL優先）
    const slHit = side === "LONG" ? bar.low <= stopLoss : bar.high >= stopLoss;
    const tpHit = side === "LONG" ? bar.high >= takeProfit1 : bar.low <= takeProfit1;

    if (slHit) {
      return { exited: true, exitReason: "STOP_LOSS", rawExitPrice: stopLoss, isGap: false, exitBarTime: bar.time };
    }
    if (tpHit) {
      return { exited: true, exitReason: "TAKE_PROFIT", rawExitPrice: takeProfit1, isGap: false, exitBarTime: bar.time };
    }
  }

  // ③ 最大保有期間の超過チェック（決済すべきバーが少なくとも1本存在する場合のみ、
  // その最新の確定close値を強制決済価格として使う。バーが1本も無ければ価格が分からないため
  // 今回のtickでは判定を見送り、次回に持ち越す）。
  if (now >= maxHoldUntil && sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    return { exited: true, exitReason: "TIMEOUT", rawExitPrice: last.close, isGap: false, exitBarTime: last.time };
  }

  return NOT_EXITED;
}
