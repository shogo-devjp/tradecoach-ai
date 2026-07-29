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
      // 最初のEMAは単純移動平均で初期化する（一般的なEMAの算出方法）
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
