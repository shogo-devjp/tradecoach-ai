import { Sparkles } from "lucide-react";

export default function AIComment({ comment }: { comment: string }) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
        <Sparkles size={16} />
        AIコメント
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-200">{comment}</p>
    </div>
  );
}
