import { MessageCircle } from "lucide-react";

// 「今日やること」の直下に表示する、状況固有の短い理由（analysis.todayActionReasonをそのまま使う）。
export default function AICoachComment({ comment }: { comment: string }) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
        <MessageCircle size={16} />
        AIからのひとこと
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-100">{comment}</p>
    </div>
  );
}
