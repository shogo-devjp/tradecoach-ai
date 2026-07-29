import { Gauge } from "lucide-react";
import type { Signal, TrendDirection } from "@/app/lib/technicalAnalysis/types";
import ConfidenceStars from "./ConfidenceStars";
import SignalBadge from "./SignalBadge";

interface ScoreCardProps {
  score: number;
  signal: Signal;
  confidence: number;
  trend: TrendDirection;
}

function scoreColor(score: number): string {
  if (score >= 65) return "bg-emerald-400";
  if (score <= 35) return "bg-rose-400";
  return "bg-amber-300";
}

export default function ScoreCard({ score, signal, confidence, trend }: ScoreCardProps) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <Gauge size={18} className="text-blue-400" />
          総合評価
        </div>
        <SignalBadge signal={signal} />
      </div>

      <div className="mt-3 flex items-end gap-2">
        <span className="tabular-nums text-5xl font-extrabold text-white">{score}</span>
        <span className="mb-1 text-slate-400">/ 100点</span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${scoreColor(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-y-2 text-sm text-slate-300">
        <span className="flex items-center gap-2">
          信頼度
          <ConfidenceStars confidence={confidence} />
          <span className="tabular-nums text-xs text-slate-400">({confidence}%)</span>
        </span>
        <span>トレンド: <span className="font-semibold text-white">{trend}</span></span>
      </div>
    </div>
  );
}
