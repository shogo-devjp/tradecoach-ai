import type { CurrencyPairConfig, FxDecision, FxScoreResult } from "@/app/lib/fx/types";
import FxSignalBadge from "./FxSignalBadge";

interface FxDecisionCardProps {
  pair: CurrencyPairConfig;
  price: number;
  decision: FxDecision;
  score: FxScoreResult;
}

export default function FxDecisionCard({ pair, price, decision, score }: FxDecisionCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center">
      <p className="text-sm font-semibold text-slate-400">{pair.displayName}</p>
      <p className="tabular-nums mt-1 text-4xl font-extrabold text-white">{price.toFixed(pair.priceDecimals)}</p>

      <div className="mt-4 flex justify-center">
        <FxSignalBadge signal={decision.signal} size="lg" />
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-300">
        <span>Confidence Score</span>
        <span className="tabular-nums text-lg font-bold text-white">{decision.confidence}%</span>
      </div>

      <div className="mt-3 flex justify-center gap-4 text-xs text-slate-400">
        <span>
          BUY <span className="tabular-nums font-semibold text-emerald-400">{score.buyScore}</span>
        </span>
        <span>
          SELL <span className="tabular-nums font-semibold text-rose-400">{score.sellScore}</span>
        </span>
      </div>
    </div>
  );
}
