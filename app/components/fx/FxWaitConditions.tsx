import { Hourglass } from "lucide-react";
import type { WaitReasonCode } from "@/app/lib/fx/types";

// WaitReasonCode（app/lib/fx/decision/decision.ts）を「次に何が起きたら再チェックすべきか」という
// 行動目線の文言に変換する表示専用のマップ。判定ロジック・スコアリング・閾値には一切関与しない。
const WAIT_CONDITION_LABEL: Record<WaitReasonCode, string> = {
  TREND_UNCLEAR: "BUY/SELLどちらかのスコアが明確に優勢になるのを待つ",
  HIGHER_LOWER_CONFLICT: "上位足と下位足の方向が一致するのを待つ",
  EXTREME_VOLATILITY: "値動きの荒さが落ち着くのを待つ",
  STOP_TOO_FAR: "損切り幅が適正な範囲に収まる価格まで待つ",
  POOR_RISK_REWARD: "リスクリワードが目安を満たす水準まで待つ",
  MID_RANGE_SR: "価格がサポート・レジスタンスに近づくのを待つ",
  INDICATOR_CONFLICT: "上位足トレンドとモメンタムの矛盾が解消するのを待つ",
  ECONOMIC_EVENT_RISK: "重要指標の発表が過ぎるのを待つ",
};

// 画面の優先順位3番目「今は何を待つべきか」。WAIT時のみ表示する。
export default function FxWaitConditions({ waitReasonCodes }: { waitReasonCodes: WaitReasonCode[] }) {
  if (waitReasonCodes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-200">
        <Hourglass size={16} />
        今は何を待つべきか
      </div>
      <ul className="space-y-1.5 text-sm text-amber-100/90">
        {waitReasonCodes.map((code) => (
          <li key={code} className="flex gap-2">
            <span className="text-amber-400">・</span>
            {WAIT_CONDITION_LABEL[code]}
          </li>
        ))}
      </ul>
    </div>
  );
}
