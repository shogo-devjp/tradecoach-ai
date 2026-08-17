import type { FxScoreResult } from "@/app/lib/fx/types";

function contributionColor(value: number): string {
  if (value > 0.1) return "text-emerald-400";
  if (value < -0.1) return "text-rose-400";
  return "text-slate-400";
}

// BUY SCORE / SELL SCORE と各要素の寄与度を表示する（要件8）
export default function FxScoreBreakdown({ score }: { score: FxScoreResult }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">スコア内訳</h3>
        <span className="text-xs text-slate-500">上位足・下位足の合意度 {(score.agreement * 100).toFixed(0)}%</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm font-bold">
        <span className="text-emerald-400">BUY SCORE {score.buyScore}</span>
        <span className="text-rose-400">SELL SCORE {score.sellScore}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-rose-500/30">
        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${score.buyScore}%` }} />
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {score.breakdown.map((item) => (
          <li key={item.label} className="rounded-lg bg-slate-900 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-300">{item.label}</span>
              <span className={`tabular-nums font-semibold ${contributionColor(item.contribution)}`}>
                {item.contribution >= 0 ? "+" : ""}
                {item.contribution.toFixed(2)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
