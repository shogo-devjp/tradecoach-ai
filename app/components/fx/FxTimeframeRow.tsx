import type { TimeframeDirection } from "@/app/lib/fx/types";

const ARROW_COLOR: Record<TimeframeDirection["arrow"], string> = {
  "↑": "text-emerald-400",
  "↓": "text-rose-400",
  "→": "text-slate-400",
};

export default function FxTimeframeRow({ directions }: { directions: TimeframeDirection[] }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">マルチタイムフレーム分析</h3>
      <div className="grid grid-cols-5 gap-2 text-center">
        {directions.map((d) => (
          <div key={d.timeframe} className="rounded-xl border border-slate-700 bg-slate-900 py-3">
            <p className="text-xs text-slate-400">{d.timeframe}</p>
            <p className={`mt-1 text-2xl font-bold ${ARROW_COLOR[d.arrow]}`}>{d.arrow}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
