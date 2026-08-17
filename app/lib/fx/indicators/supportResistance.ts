// FX専用のサポート・レジスタンス判定。株式版と考え方は似ているが、対象がタイムフレーム別の
// 直近高値・安値になるためロジックを独立させている（ルックバック本数など前提が異なるため）。
export interface SupportResistanceResult {
  support: number;
  resistance: number;
  recentHigh: number;
  recentLow: number;
}

export function findSupportResistance(highs: number[], lows: number[], lookback = 40): SupportResistanceResult {
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);

  const recentHigh = Math.max(...recentHighs);
  const recentLow = Math.min(...recentLows);

  // サポート・レジスタンスは直近高値・安値そのものを採用する（シンプルなスイング高安値方式）。
  // 将来的にはピボットポイントやフラクタルによる複数レベル検出への拡張余地を残す。
  return { support: recentLow, resistance: recentHigh, recentHigh, recentLow };
}
