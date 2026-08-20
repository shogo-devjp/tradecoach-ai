// 設計書§10。^N225 Buy&Holdシミュレーション。
// Paper Trading開始日に初期資金を指数のOpenで購入したと仮定し、以降は日次終値で評価額を
// 再計算するだけ（リバランスなし、配当再投資は簡略化のため考慮しない）。

export interface BenchmarkState {
  symbol: string;
  startDate: string;
  initialCapital: number;
  entryIndexPrice: number; // 開始日のOpen
  units: number; // 仮想的な購入口数（initialCapital / entryIndexPrice）
}

export function startBenchmark(symbol: string, startDate: string, initialCapital: number, entryIndexPrice: number): BenchmarkState {
  return {
    symbol,
    startDate,
    initialCapital,
    entryIndexPrice,
    units: entryIndexPrice > 0 ? initialCapital / entryIndexPrice : 0,
  };
}

export function benchmarkValue(state: BenchmarkState, currentIndexClose: number): number {
  return state.units * currentIndexClose;
}

export function benchmarkReturnPercent(state: BenchmarkState, currentIndexClose: number): number {
  const value = benchmarkValue(state, currentIndexClose);
  return Math.round(((value - state.initialCapital) / state.initialCapital) * 1000) / 10;
}
