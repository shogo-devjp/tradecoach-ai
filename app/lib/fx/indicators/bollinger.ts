// FX専用: ボリンジャーバンド。株式版には存在しないためFX側で新規実装する。
export interface BollingerResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  // バンド幅を中心線に対する%で表したもの（ボラティリティの拡大/収縮の判定に使う）
  widthPercent: (number | null)[];
}

export function calculateBollingerBands(closes: number[], period = 20, stdDevMultiple = 2): BollingerResult {
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const middle: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  const widthPercent: (number | null)[] = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((sum, v) => sum + v, 0) / period;
    const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
    const stdDev = Math.sqrt(variance);

    middle[i] = mean;
    upper[i] = mean + stdDev * stdDevMultiple;
    lower[i] = mean - stdDev * stdDevMultiple;
    widthPercent[i] = mean !== 0 ? ((upper[i]! - lower[i]!) / mean) * 100 : 0;
  }

  return { upper, middle, lower, widthPercent };
}
