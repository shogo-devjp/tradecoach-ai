import type { CurrencyPairConfig, FxDecision, FxScoreResult } from "@/app/lib/fx/types";
import FxSignalBadge from "./FxSignalBadge";

interface FxDecisionCardProps {
  pair: CurrencyPairConfig;
  price: number;
  decision: FxDecision;
  score: FxScoreResult;
}

// 画面の最優先セクション（1. 現在の判断）。WAIT時は「様子見」を最も強く見せ、
// Confidence/BUY・SELLスコアの視覚的な優先度を判定バッジより下げることで、
// 「数値が出ている＝根拠が強い」という誤解を防ぐ。BUY/SELL時も断定表現は使わない。
export default function FxDecisionCard({ pair, price, decision, score }: FxDecisionCardProps) {
  const isWait = decision.signal === "待ち";

  return (
    <div className={`rounded-2xl border p-6 text-center ${isWait ? "border-amber-500/40 bg-slate-800" : "border-slate-700 bg-slate-800"}`}>
      <p className="text-sm font-semibold text-slate-400">{pair.displayName}</p>
      <p className="tabular-nums mt-1 text-4xl font-extrabold text-white">{price.toFixed(pair.priceDecimals)}</p>

      <div className="mt-4 flex justify-center">
        <FxSignalBadge signal={decision.signal} size="lg" />
      </div>

      <p className="mt-3 text-sm text-slate-300">
        {isWait
          ? "今はエントリーを見送り、条件が揃うのを待つのがおすすめです。"
          : "条件が揃っているため、エントリー候補として検討できます（最終判断はご自身で行ってください）。"}
      </p>

      <div className={`mt-4 flex items-center justify-center gap-2 ${isWait ? "text-xs text-slate-500" : "text-sm text-slate-300"}`}>
        <span>Confidence Score</span>
        <span className={`tabular-nums font-bold ${isWait ? "text-sm text-slate-400" : "text-lg text-white"}`}>
          {decision.confidence}%
        </span>
      </div>

      <div className={`mt-2 flex justify-center gap-4 ${isWait ? "text-[11px] text-slate-500" : "text-xs text-slate-400"}`}>
        <span>
          BUY <span className={`tabular-nums font-semibold ${isWait ? "text-slate-500" : "text-emerald-400"}`}>{score.buyScore}</span>
        </span>
        <span>
          SELL <span className={`tabular-nums font-semibold ${isWait ? "text-slate-500" : "text-rose-400"}`}>{score.sellScore}</span>
        </span>
      </div>
    </div>
  );
}
