import { Lightbulb } from "lucide-react";

// 「今日のチェックポイント」の下に表示する、相場全般に効く心構え文（analysis.beginnerAdvice）。
// AIからのひとこと（状況固有の理由）とは役割を分け、こちらは一般的な心構えを扱う。
export default function BeginnerAdviceCard({ advice }: { advice: string }) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
        <Lightbulb size={16} />
        初心者向けアドバイス
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-100">{advice}</p>
    </div>
  );
}
