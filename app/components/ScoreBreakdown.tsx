import type { ScoreBreakdownItem } from "@/app/lib/technicalAnalysis/types";

const STATUS_COLOR: Record<ScoreBreakdownItem["status"], string> = {
  positive: "bg-emerald-400",
  negative: "bg-rose-400",
  neutral: "bg-amber-300",
};

export default function ScoreBreakdown({ breakdown }: { breakdown: ScoreBreakdownItem[] }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
      <h3 className="text-sm font-semibold text-slate-300">スコア内訳</h3>
      <div className="mt-3 space-y-2">
        {breakdown.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-xs text-slate-400">
              {item.label}
              {!item.contributesToScore && <span className="ml-1 text-slate-600">(参考)</span>}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-900">
              <div
                className={`h-full rounded-full ${STATUS_COLOR[item.status]}`}
                style={{ width: `${item.points * 10}%` }}
              />
            </div>
            <span className="tabular-nums w-12 shrink-0 text-right text-xs font-semibold text-white">
              {item.points}/10
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
