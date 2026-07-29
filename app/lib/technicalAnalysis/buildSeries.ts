import type { ChartResultArray } from "yahoo-finance2/modules/chart";
import type { OHLCVSeries } from "./types";

// yahoo-finance2 の chart() は株式分割をまたぐ期間でも「未調整」の実際の株価を返す。
// 分割前の日付には過去の分割比率を掛けて現在の株価水準に合わせないと、
// 移動平均・RSI・ATR・サポレジなど全ての指標が分割日の境目で壊れる。
export function buildOHLCVSeries(chart: ChartResultArray): OHLCVSeries {
  const quotes = chart.quotes.filter(
    (q) => q.close !== null && q.high !== null && q.low !== null && q.volume !== null
  );

  const closes = quotes.map((q) => q.close as number);
  const highs = quotes.map((q) => q.high as number);
  const lows = quotes.map((q) => q.low as number);
  const volumes = quotes.map((q) => q.volume as number);
  const dates = quotes.map((q) => q.date);

  const splits = chart.events?.splits ?? [];
  for (const split of splits) {
    const factor = split.numerator / split.denominator;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] < split.date) {
        closes[i] /= factor;
        highs[i] /= factor;
        lows[i] /= factor;
        volumes[i] *= factor;
      }
    }
  }

  return { closes, highs, lows, volumes };
}
