import type { FxDirection, MultiTimeframeResult, Timeframe, TimeframeDirection } from "@/app/lib/fx/types";

const ARROW_COLOR: Record<TimeframeDirection["arrow"], string> = {
  "↑": "text-emerald-400",
  "↓": "text-rose-400",
  "→": "text-slate-400",
};

const DIRECTION_WORD: Record<FxDirection, string> = {
  up: "上向き",
  down: "下向き",
  flat: "横ばい",
};

const HIGHER_TIMEFRAMES: Timeframe[] = ["1d", "4h"];
const LOWER_TIMEFRAMES: Timeframe[] = ["15m", "5m"];

// 指定したタイムフレーム群の中で最も多い方向を返す（同数の場合はnull＝判定不能）。
function dominantDirection(directions: TimeframeDirection[], timeframes: Timeframe[]): FxDirection | null {
  const subset = directions.filter((d) => timeframes.includes(d.timeframe));
  if (subset.length === 0) return null;

  const counts: Record<FxDirection, number> = { up: 0, down: 0, flat: 0 };
  for (const d of subset) counts[d.direction]++;

  const max = Math.max(counts.up, counts.down, counts.flat);
  const top = (Object.keys(counts) as FxDirection[]).filter((key) => counts[key] === max);
  return top.length === 1 ? top[0] : null;
}

// 矢印の羅列だけでは初心者に伝わらないため、「短期と上位足の方向が揃っているか」を
// 日本語の一文で補足する（判定ロジックには影響しない、表示専用の説明文）。
function buildExplanation(multiTimeframe: MultiTimeframeResult): string {
  const { directions, higherLowerConflict } = multiTimeframe;
  const higherDir = dominantDirection(directions, HIGHER_TIMEFRAMES);
  const lowerDir = dominantDirection(directions, LOWER_TIMEFRAMES);

  if (higherLowerConflict && higherDir && lowerDir) {
    return `短期足は${DIRECTION_WORD[lowerDir]}ですが、上位足（日足・4時間足）は${DIRECTION_WORD[higherDir]}です。時間足の方向が揃っていないため待機が安全です。`;
  }
  if (higherDir && lowerDir && higherDir === lowerDir && higherDir !== "flat") {
    return `短期足・上位足とも${DIRECTION_WORD[higherDir]}で、方向が揃っています。`;
  }
  return "時間足によって方向感にばらつきがあります。方向が揃うまでは慎重に見ましょう。";
}

export default function FxTimeframeRow({ multiTimeframe }: { multiTimeframe: MultiTimeframeResult }) {
  const explanation = buildExplanation(multiTimeframe);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-300">マルチタイムフレーム分析</h3>
      <div className="grid grid-cols-5 gap-2 text-center">
        {multiTimeframe.directions.map((d) => (
          <div key={d.timeframe} className="rounded-xl border border-slate-700 bg-slate-900 py-3">
            <p className="text-xs text-slate-400">{d.timeframe}</p>
            <p className={`mt-1 text-2xl font-bold ${ARROW_COLOR[d.arrow]}`}>{d.arrow}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-400">{explanation}</p>
    </div>
  );
}
