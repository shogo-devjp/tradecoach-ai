import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { FxDecision } from "@/app/lib/fx/types";
import { DECISION_LABEL } from "@/app/lib/fx/displayLabels";

const DECISION_STYLES: Record<FxDecision, { text: string; bg: string; border: string; Icon: typeof TrendingUp }> = {
  BUY: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40", Icon: TrendingUp },
  SELL: { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/40", Icon: TrendingDown },
  WAIT: { text: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/40", Icon: Minus },
};

export default function FxDecisionBadge({ decision }: { decision: FxDecision }) {
  const style = DECISION_STYLES[decision];
  const Icon = style.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${style.text} ${style.bg} ${style.border}`}
    >
      <Icon size={16} />
      {DECISION_LABEL[decision]}
    </span>
  );
}
