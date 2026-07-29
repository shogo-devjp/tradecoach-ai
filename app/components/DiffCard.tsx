import { ArrowRight } from "lucide-react";
import type { AnalysisDiff } from "@/app/lib/localStore/history";

function formatDelta(value: number, suffix: string): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}${suffix}`;
}

function deltaColor(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-slate-400";
}

export default function DiffCard({ diff }: { diff: AnalysisDiff }) {
  const previousDate = new Date(diff.previousTimestamp).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
      <p className="text-xs font-semibold text-blue-300">前回分析（{previousDate}）からの変化</p>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-300">
        <span>
          スコア：
          <span className={`tabular-nums font-semibold ${deltaColor(diff.scoreDelta)}`}>
            {formatDelta(diff.scoreDelta, "")}
          </span>
        </span>
        <span>
          信頼度：
          <span className={`tabular-nums font-semibold ${deltaColor(diff.confidenceDelta)}`}>
            {formatDelta(diff.confidenceDelta, "%")}
          </span>
        </span>
      </div>

      {diff.strategyChanged && (
        <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-200">
          戦略：{diff.previousStrategyAction}
          <ArrowRight size={14} className="text-slate-500" />
          <span className="font-semibold text-white">{diff.currentStrategyAction}</span>
          に変化
        </div>
      )}
    </div>
  );
}
