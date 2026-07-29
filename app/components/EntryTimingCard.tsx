import StarRating from "./StarRating";
import type { TodayAction } from "@/app/lib/technicalAnalysis/types";
import { TODAY_ACTION_EMOJI, TODAY_ACTION_LABEL } from "@/app/lib/technicalAnalysis/displayLabels";

const ACTION_STYLES: Record<TodayAction, { border: string; bg: string; text: string }> = {
  今すぐエントリー: { border: "border-emerald-500/50", bg: "bg-emerald-500/10", text: "text-emerald-300" },
  押し目待ち: { border: "border-amber-500/50", bg: "bg-amber-500/10", text: "text-amber-300" },
  ブレイク待ち: { border: "border-blue-500/50", bg: "bg-blue-500/10", text: "text-blue-300" },
  様子見: { border: "border-slate-600", bg: "bg-slate-800", text: "text-slate-300" },
  見送り: { border: "border-rose-500/50", bg: "bg-rose-500/10", text: "text-rose-300" },
  本日は休みましょう: { border: "border-slate-600", bg: "bg-slate-800", text: "text-slate-300" },
};

interface TodayActionCardProps {
  action: TodayAction;
  timingScore: number;
}

// 画面を開いて10秒以内に「今日何をすればいいか」が伝わるよう、分析結果の最上部に配置する
// 「今日やること」カード。状況固有の理由は直下のAICoachComment（AIからのひとこと）が担うため、
// ここでは行動そのものだけに絞り重複を避ける。
// 余白を広めに取り、見出しを大きくして視認性を優先する（Apple風のシンプルなトーン）。
export default function EntryTimingCard({ action, timingScore }: TodayActionCardProps) {
  const style = ACTION_STYLES[action];

  return (
    <div className={`rounded-3xl border-2 ${style.border} ${style.bg} p-6 sm:p-8`}>
      <div className="text-center text-xs font-semibold tracking-widest text-slate-500">今日やること</div>
      <div className={`mt-3 flex items-center justify-center gap-2 text-2xl font-extrabold sm:text-3xl ${style.text}`}>
        <span>{TODAY_ACTION_EMOJI[action]}</span>
        {TODAY_ACTION_LABEL[action]}
      </div>
      <div className="mt-4 flex justify-center">
        <StarRating value={timingScore} label="タイミング評価" />
      </div>
    </div>
  );
}
