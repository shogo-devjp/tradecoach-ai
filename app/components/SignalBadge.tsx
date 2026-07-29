import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Signal } from "@/app/lib/technicalAnalysis/types";
import { SIGNAL_LABEL } from "@/app/lib/technicalAnalysis/displayLabels";

const SIGNAL_STYLES: Record<Signal, { text: string; bg: string; border: string; Icon: typeof TrendingUp }> = {
  買い: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40", Icon: TrendingUp },
  売り: { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/40", Icon: TrendingDown },
  待ち: { text: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/40", Icon: Minus },
};

export default function SignalBadge({ signal }: { signal: Signal }) {
  const style = SIGNAL_STYLES[signal];
  const Icon = style.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${style.text} ${style.bg} ${style.border}`}
    >
      <Icon size={16} />
      {SIGNAL_LABEL[signal]}
    </span>
  );
}
