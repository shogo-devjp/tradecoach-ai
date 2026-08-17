// FX専用: ADX（平均方向性指数）。トレンドの「強さ」（方向は問わない）を測る指標で、
// 相場環境判定（トレンド相場かレンジ相場か）の主要な入力として使う。株式版には存在しない。
export interface ADXResult {
  adx: (number | null)[];
  plusDI: (number | null)[];
  minusDI: (number | null)[];
}

function wilderSmooth(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;

  let sum = values.slice(0, period).reduce((s, v) => s + v, 0);
  result[period - 1] = sum;
  for (let i = period; i < values.length; i++) {
    sum = sum - sum / period + values[i];
    result[i] = sum;
  }
  return result;
}

export function calculateADX(highs: number[], lows: number[], closes: number[], period = 14): ADXResult {
  const n = highs.length;
  const trueRanges: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);

  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    const prevClose = closes[i - 1];
    trueRanges[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - prevClose), Math.abs(lows[i] - prevClose));
  }

  const smoothedTR = wilderSmooth(trueRanges, period);
  const smoothedPlusDM = wilderSmooth(plusDM, period);
  const smoothedMinusDM = wilderSmooth(minusDM, period);

  const plusDI: (number | null)[] = new Array(n).fill(null);
  const minusDI: (number | null)[] = new Array(n).fill(null);
  const dx: (number | null)[] = new Array(n).fill(null);

  for (let i = 0; i < n; i++) {
    const tr = smoothedTR[i];
    const pDM = smoothedPlusDM[i];
    const mDM = smoothedMinusDM[i];
    if (tr === null || pDM === null || mDM === null || tr === 0) continue;

    plusDI[i] = (pDM / tr) * 100;
    minusDI[i] = (mDM / tr) * 100;
    const diSum = plusDI[i]! + minusDI[i]!;
    dx[i] = diSum === 0 ? 0 : (Math.abs(plusDI[i]! - minusDI[i]!) / diSum) * 100;
  }

  const firstDxIndex = dx.findIndex((v) => v !== null);
  const adx: (number | null)[] = new Array(n).fill(null);
  if (firstDxIndex === -1 || firstDxIndex + period > n) return { adx, plusDI, minusDI };

  const dxValues = dx.slice(firstDxIndex, firstDxIndex + period).filter((v): v is number => v !== null);
  let adxValue = dxValues.reduce((s, v) => s + v, 0) / period;
  adx[firstDxIndex + period - 1] = adxValue;

  for (let i = firstDxIndex + period; i < n; i++) {
    const dxi = dx[i] ?? adxValue;
    adxValue = (adxValue * (period - 1) + dxi) / period;
    adx[i] = adxValue;
  }

  return { adx, plusDI, minusDI };
}
