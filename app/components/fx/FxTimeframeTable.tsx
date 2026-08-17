import type { MultiTimeframeResult } from "@/app/lib/fx/types";
import { DIRECTION_ARROW, TIMEFRAME_LABEL } from "@/app/lib/fx/displayLabels";

// 表示は「5m→15m→1h→4h→1d」の昇順（要件13の例に合わせる）。
// エンジン内部のFX_TIMEFRAME_ORDER（config/timeframes.ts）は上位足から並べているため、ここで表示用に反転させる。
const DISPLAY_ORDER = ["5m", "15m", "1h", "4h", "1d"] as const;

function arrowColor(direction: string | undefined): string {
  if (direction === "上昇") return "text-emerald-400";
  if (direction === "下降") return "text-rose-400";
  return "text-slate-400";
}

export default function FxTimeframeTable({ multiTimeframe }: { multiTimeframe: MultiTimeframeResult }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="text-sm font-semibold text-slate-300">マルチタイムフレーム分析</h3>

      <div className="mt-3 grid grid-cols-5 gap-2 text-center">
        {DISPLAY_ORDER.map((tf) => {
          const analysis = multiTimeframe.byTimeframe[tf];
          return (
            <div key={tf} className="rounded-xl border border-slate-700 bg-slate-900 p-3">
              <p className="text-xs text-slate-500">{TIMEFRAME_LABEL[tf]}</p>
              <p className={`mt-1 text-xl font-bold ${arrowColor(analysis?.direction)}`}>
                {analysis ? DIRECTION_ARROW[analysis.direction] : "―"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
