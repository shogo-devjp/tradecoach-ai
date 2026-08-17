import { Gauge } from "lucide-react";
import { getFxPair } from "@/app/lib/fx/config/pairs";
import type { FxAnalysisResult } from "@/app/lib/fx/types";
import FxDecisionBadge from "./FxDecisionBadge";

// 画面を開いて最初に目に入る、最も重要な情報（要件13：通貨ペア・現在価格・BUY/SELL/WAIT・Confidence）
export default function FxDecisionCard({ result }: { result: FxAnalysisResult }) {
  const pairDef = getFxPair(result.pair);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center">
      <p className="text-sm font-semibold text-slate-400">{pairDef.displayName}</p>
      <p className="mt-1 tabular-nums text-5xl font-extrabold text-white">
        {result.currentPrice.toFixed(pairDef.priceDecimals)}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <FxDecisionBadge decision={result.decision.decision} />
        <span className="flex items-center gap-1.5 text-sm text-slate-300">
          <Gauge size={16} className="text-blue-400" />
          Confidence Score {result.decision.confidence}%
        </span>
      </div>
    </div>
  );
}
