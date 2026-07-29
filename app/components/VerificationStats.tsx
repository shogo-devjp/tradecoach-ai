import { CheckCircle2, Clock, Target } from "lucide-react";
import type { AggregateStats } from "@/app/lib/verification/aggregate";

function winRateColor(winRate: number | null): string {
  if (winRate === null) return "text-slate-400";
  if (winRate >= 60) return "text-emerald-400";
  if (winRate >= 45) return "text-amber-300";
  return "text-rose-400";
}

function WinRateRow({ label, total, win, loss, winRate }: { label: string; total: number; win: number; loss: number; winRate: number | null }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-700 py-2 text-sm last:border-0">
      <span className="text-slate-300">{label}</span>
      <span className="text-xs text-slate-500">
        {total}件（{win}勝{loss}敗）
      </span>
      <span className={`tabular-nums font-bold ${winRateColor(winRate)}`}>
        {winRate === null ? "―" : `${winRate}%`}
      </span>
    </div>
  );
}

export default function VerificationStats({ stats }: { stats: AggregateStats }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Target size={16} className="text-blue-400" />
          総合勝率
        </div>
        <div className="mt-2 flex items-end gap-2">
          <span className={`tabular-nums text-4xl font-extrabold ${winRateColor(stats.overallWinRate)}`}>
            {stats.overallWinRate === null ? "―" : `${stats.overallWinRate}%`}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <CheckCircle2 size={14} /> 確定{stats.settledCount}件
          </span>
          <span className="flex items-center gap-1">
            <Clock size={14} /> 判定待ち{stats.pendingCount}件
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-300">シグナル別勝率</h3>
        {Object.entries(stats.bySignal).map(([signal, s]) => (
          <WinRateRow key={signal} label={signal} {...s} />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <h3 className="mb-2 text-sm font-semibold text-slate-300">スコア帯別勝率</h3>
        {stats.byScoreBucket.map((bucket) => (
          <WinRateRow key={bucket.range} label={`${bucket.range}点`} {...bucket} />
        ))}
      </div>
    </div>
  );
}
