// 値動きの勢い＝直近N本の変化率(%)。ROC(Rate of Change)のシンプルな実装。
// MACDヒストグラムとは別に「単純な値幅の勢い」を見るための補助指標として使う。
export function calculateMomentum(closes: number[], period = 10): (number | null)[] {
  return closes.map((close, i) => {
    if (i < period) return null;
    const past = closes[i - period];
    if (past === 0) return null;
    return ((close - past) / past) * 100;
  });
}
