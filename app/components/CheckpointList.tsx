import { CheckCircle2 } from "lucide-react";

// 「今日のチェックポイント」は常に3つだけ表示する（情報量を増やさない方針のため）。
export default function CheckpointList({ checkpoints }: { checkpoints: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">今日のチェックポイント</h3>
      <ul className="space-y-2">
        {checkpoints.map((checkpoint) => (
          <li key={checkpoint} className="flex items-start gap-2 text-sm text-slate-200">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
            {checkpoint}
          </li>
        ))}
      </ul>
    </div>
  );
}
