// ADX（Average Directional Index）。トレンドの「強さ」を0〜100で表す（方向は+DI/-DIで判定）。
// レンジ相場かトレンド相場かを見分けるためにmarketRegime/detectRegime.tsで使用する。
export interface ADXResult {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

function wilderSmooth(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  let smoothed = values.slice(0, period).reduce((sum, v) => sum + v, 0);
  result[period - 1] = smoothed;

  for (let i = period; i < values.length; i++) {
    smoothed = smoothed - smoothed / period + values[i];
    result[i] = smoothed;
  }
  return result;
}

export function calculateADX(highs: number[], lows: number[], closes: number[], period = 14): ADXResult {
  const n = highs.length;
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  const trueRange: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    const prevClose = closes[i - 1];
    trueRange[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - prevClose), Math.abs(lows[i] - prevClose));
  }

  const smoothedPlusDM = wilderSmooth(plusDM.slice(1), period);
  const smoothedMinusDM = wilderSmooth(minusDM.slice(1), period);
  const smoothedTR = wilderSmooth(trueRange.slice(1), period);

  // slice(1)でindexを1つずらしたぶん、結果を元の長さ・indexに戻す
  const shift = (arr: (number | null)[]): (number | null)[] => [null, ...arr];
  const sPlusDM = shift(smoothedPlusDM);
  const sMinusDM = shift(smoothedMinusDM);
  const sTR = shift(smoothedTR);

  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  const dx: (number | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const tr = sTR[i];
    const pdm = sPlusDM[i];
    const mdm = sMinusDM[i];
    if (tr === null || pdm === null || mdm === null || tr === 0) continue;

    const pdi = (pdm / tr) * 100;
    const mdi = (mdm / tr) * 100;
    plusDI[i] = pdi;
    minusDI[i] = mdi;

    const diSum = pdi + mdi;
    dx[i] = diSum === 0 ? 0 : (Math.abs(pdi - mdi) / diSum) * 100;
  }

  // ADXはDXをさらにWilder平滑化したもの
  const firstDxIndex = dx.findIndex((v) => v !== null);
  const adx: (number | null)[] = new Array(n).fill(null);
  if (firstDxIndex >= 0 && firstDxIndex + period <= n) {
    const dxValues = dx.slice(firstDxIndex, firstDxIndex + period) as number[];
    let avg = dxValues.reduce((sum, v) => sum + v, 0) / period;
    adx[firstDxIndex + period - 1] = avg;
    for (let i = firstDxIndex + period; i < n; i++) {
      const dxi = dx[i];
      if (dxi === null) continue;
      avg = (avg * (period - 1) + dxi) / period;
      adx[i] = avg;
    }
  }

  return { adx, plusDI, minusDI };
}
