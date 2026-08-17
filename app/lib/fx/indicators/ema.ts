// 指数平滑移動平均。株式版 indicators/ema.ts と同じアルゴリズムだが、
// FXエンジンを株式エンジンから独立させる方針のためあえて別実装として持つ。
export function calculateEMA(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let prevEma: number | null = null;

  values.forEach((value, i) => {
    if (i < period - 1) {
      result.push(null);
      return;
    }
    if (prevEma === null) {
      const seed = values.slice(i - period + 1, i + 1).reduce((sum, v) => sum + v, 0) / period;
      prevEma = seed;
      result.push(seed);
      return;
    }
    prevEma = value * k + prevEma * (1 - k);
    result.push(prevEma);
  });

  return result;
}
