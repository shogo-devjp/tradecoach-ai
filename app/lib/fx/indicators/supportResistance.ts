export interface SupportResistanceResult {
  support: number;
  resistance: number;
}

// 直近lookback本の高値・安値からサポート・レジスタンスを算出する単純な手法。
// 株式版と同じ考え方だが、pipSize等FX特有の単位を扱うためFX側で独立して持つ。
export function findSupportResistance(highs: number[], lows: number[], lookback = 60): SupportResistanceResult {
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);
  return {
    resistance: Math.max(...recentHighs),
    support: Math.min(...recentLows),
  };
}
