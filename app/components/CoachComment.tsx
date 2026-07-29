import { GraduationCap } from "lucide-react";

export default function CoachComment({ comment }: { comment: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
        <GraduationCap size={16} />
        コーチからのアドバイス
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-100">{comment}</p>
    </div>
  );
}
