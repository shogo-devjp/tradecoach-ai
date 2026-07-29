import { CheckCircle2, ListChecks } from "lucide-react";

export default function ReasonsList({ reasons }: { reasons: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
        <ListChecks size={16} className="text-blue-400" />
        判定の根拠
      </div>
      <ul className="mt-3 space-y-2">
        {reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2 text-sm text-slate-200">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
