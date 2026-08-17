import { ListChecks } from "lucide-react";

export default function FxReasonsList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
        <ListChecks size={16} className="text-blue-400" />
        判定の根拠
      </div>
      <ul className="space-y-1.5 text-sm text-slate-300">
        {reasons.map((reason, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-blue-400">・</span>
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
