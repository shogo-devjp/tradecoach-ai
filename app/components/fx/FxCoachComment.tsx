import { Sparkles } from "lucide-react";

export default function FxCoachComment({ comment }: { comment: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
        <Sparkles size={16} />
        AIコーチコメント
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-200">{comment}</p>
    </div>
  );
}
