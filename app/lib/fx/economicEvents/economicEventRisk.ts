import type { EconomicEventRisk, FxPairCode } from "../types";

// 要件12の拡張ポイント。将来、米国CPI・雇用統計・FOMC・FRB政策金利・日銀金融政策決定会合・
// 日本CPIなどのリアルタイム経済カレンダーと連携し、「重要指標30分前は新規エントリーを避ける」
// といった判定をここに実装する。
// Phase 1ではカレンダーが未実装のため、常に「リスクなし」を返すだけの関数として用意しておき、
// risk/decision.tsの呼び出し側（analyzeFxPair.ts）のインターフェースだけ先に固定する。
// バックテスト可能な設計を保つため、現在時刻はDate.now()を直接呼ばず引数で受け取る。
export function getEconomicEventRisk(pair: FxPairCode, now: Date): EconomicEventRisk {
  // Phase 1では未実装のため意図的に未使用（将来ここでpair/nowを使って判定する）。
  void pair;
  void now;
  return {
    hasUpcomingHighImpactEvent: false,
    minutesUntilEvent: null,
    eventName: null,
    recommendation: "normal",
  };
}
