import { Minus, ShieldAlert, ShieldCheck, ShieldX, TrendingDown, TrendingUp } from "lucide-react";
import type { MarketSentiment, RiskAssessment, RiskLevel, StrategyAction, TodayStrategy } from "@/app/lib/technicalAnalysis/types";
import EntryPriorityStars from "./EntryPriorityStars";

const ACTION_STYLES: Record<StrategyAction, { text: string; border: string; bg: string }> = {
  買い場: { text: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
  待機: { text: "text-amber-300", border: "border-amber-500/40", bg: "bg-amber-500/10" },
  利確優先: { text: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-500/10" },
};

const RISK_STYLES: Record<RiskLevel, { text: string; bg: string; Icon: typeof ShieldCheck }> = {
  低: { text: "text-emerald-400", bg: "bg-emerald-500/10", Icon: ShieldCheck },
  中: { text: "text-amber-300", bg: "bg-amber-500/10", Icon: ShieldAlert },
  高: { text: "text-rose-400", bg: "bg-rose-500/10", Icon: ShieldX },
};

const SENTIMENT_STYLES: Record<MarketSentiment, { text: string; bg: string; Icon: typeof TrendingUp }> = {
  強気優勢: { text: "text-emerald-400", bg: "bg-emerald-500/10", Icon: TrendingUp },
  弱気優勢: { text: "text-rose-400", bg: "bg-rose-500/10", Icon: TrendingDown },
  様子見: { text: "text-amber-300", bg: "bg-amber-500/10", Icon: Minus },
};

interface StrategyCardProps {
  strategy: TodayStrategy;
  sentiment: MarketSentiment;
  risk: RiskAssessment;
  entryPriority: number;
}

export default function StrategyCard({ strategy, sentiment, risk, entryPriority }: StrategyCardProps) {
  const actionStyle = ACTION_STYLES[strategy.action];
  const riskStyle = RISK_STYLES[risk.level];
  const sentimentStyle = SENTIMENT_STYLES[sentiment];
  const RiskIcon = riskStyle.Icon;
  const SentimentIcon = sentimentStyle.Icon;

  return (
    <div className={`rounded-2xl border ${actionStyle.border} ${actionStyle.bg} p-5`}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${sentimentStyle.bg} ${sentimentStyle.text}`}>
          <SentimentIcon size={14} />
          相場心理：{sentiment}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${riskStyle.bg} ${riskStyle.text}`}
          title={risk.reason}
        >
          <RiskIcon size={14} />
          リスク：{risk.level}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={`text-xl font-extrabold ${actionStyle.text}`}>{strategy.headline}</h2>
        <EntryPriorityStars priority={entryPriority} />
      </div>

      <p className="mt-2 text-sm leading-relaxed text-slate-200">{strategy.description}</p>
    </div>
  );
}
