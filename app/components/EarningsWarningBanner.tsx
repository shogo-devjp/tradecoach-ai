import { CalendarClock } from "lucide-react";

interface EarningsWarningBannerProps {
  earningsDate: string;
  daysFromEarnings: number;
  isEstimate: boolean;
}

// Version 1.2: 決算発表日はAIスコア・シグナル・EntryBlockの判定には使わず、
// あくまで注意喚起の表示のみ（EntryBlockBanner.tsxと同系統の見た目）。
export default function EarningsWarningBanner({ earningsDate, daysFromEarnings, isEstimate }: EarningsWarningBannerProps) {
  const timing = daysFromEarnings < 0 ? `${Math.abs(daysFromEarnings)}日後に決算発表予定` : daysFromEarnings === 0 ? "本日が決算発表予定日" : `決算発表から${daysFromEarnings}日経過`;

  return (
    <div className="rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
        <CalendarClock size={18} />
        決算発表が近いため値動きが大きくなる可能性があります
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-100/90">
        {timing}（{earningsDate}
        {isEstimate ? "・Yahoo Financeによる予測日" : ""}）。決算内容によって株価が普段以上に大きく動くことがあるため、
        いつも以上に慎重な判断を心がけましょう。
      </p>
    </div>
  );
}
