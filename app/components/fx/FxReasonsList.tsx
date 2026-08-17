import { CheckCircle2 } from "lucide-react";

export default function FxReasonsList({ reasons }: { reasons: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">判定の理由</h3>
      <ul className="space-y-2 text-sm text-slate-300">
        {reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-blue-400" />
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
