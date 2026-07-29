import { Minus, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import type { IndicatorReason } from "@/app/lib/technicalAnalysis/types";

const STATUS_STYLES = {
  positive: { text: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/5", StatusIcon: TrendingUp },
  negative: { text: "text-rose-400", border: "border-rose-500/30", bg: "bg-rose-500/5", StatusIcon: TrendingDown },
  neutral: { text: "text-amber-300", border: "border-amber-500/30", bg: "bg-amber-500/5", StatusIcon: Minus },
} as const;

interface IndicatorCardProps {
  icon: LucideIcon;
  reason: IndicatorReason;
  badge?: string;
}

export default function IndicatorCard({ icon: Icon, reason, badge }: IndicatorCardProps) {
  const style = STATUS_STYLES[reason.status];
  const StatusIcon = style.StatusIcon;

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Icon size={16} className="text-slate-400" />
          {reason.label}
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`tabular-nums rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold ${style.text}`}>
              {badge}
            </span>
          )}
          <StatusIcon size={16} className={style.text} />
        </div>
      </div>
      <p className="mt-2 text-sm leading-snug text-slate-300">{reason.value}</p>
    </div>
  );
}
