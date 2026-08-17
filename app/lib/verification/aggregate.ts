import type { VerificationRecord } from "./types";

interface SignalStats {
  total: number;
  win: number;
  loss: number;
  winRate: number | null;
}

interface ScoreBucketStats extends SignalStats {
  range: string;
}

// Version 1.2: 待ち・本日は休みましょう・見送り等（outcome="observed"）の事後検証用。
// 勝ち負けはつけられないため、代わりに「実際どれくらい値動きがあったか」の平均絶対変化率を見る。
// これが大きいほど「休んだことで大きな値動きを回避した／機会を逃した」可能性がある、という参考情報。
export interface ObservedStats {
  total: number;
  avgAbsDay1: number | null;
  avgAbsDay3: number | null;
  avgAbsDay5: number | null;
}

export interface AggregateStats {
  totalRecords: number;
  settledCount: number;
  pendingCount: number;
  overallWinRate: number | null;
  bySignal: Record<string, SignalStats>;
  byScoreBucket: ScoreBucketStats[];
  observed: ObservedStats;
}

const SCORE_BUCKETS = [
  { range: "80-100", min: 80, max: 100 },
  { range: "65-79", min: 65, max: 79 },
  { range: "36-64", min: 36, max: 64 },
  { range: "20-35", min: 20, max: 35 },
  { range: "0-19", min: 0, max: 19 },
];

function winRate(win: number, loss: number): number | null {
  const decided = win + loss;
  if (decided === 0) return null;
  return Math.round((win / decided) * 1000) / 10;
}

function toStats(group: VerificationRecord[]): SignalStats {
  const win = group.filter((r) => r.outcome === "win").length;
  const loss = group.filter((r) => r.outcome === "loss").length;
  return { total: group.length, win, loss, winRate: winRate(win, loss) };
}

function avgAbs(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + Math.abs(v), 0) / values.length) * 10) / 10;
}

function toObservedStats(group: VerificationRecord[]): ObservedStats {
  return {
    total: group.length,
    avgAbsDay1: avgAbs(group.filter((r) => r.day1).map((r) => r.day1!.changePercent)),
    avgAbsDay3: avgAbs(group.filter((r) => r.day3).map((r) => r.day3!.changePercent)),
    avgAbsDay5: avgAbs(group.filter((r) => r.day5).map((r) => r.day5!.changePercent)),
  };
}

// 将来のスコア配点調整のための集計。勝率は「買い/売りとして方向性のある判定をして、
// 結果が伴ったかどうか」のみを対象にする（待ち＝neutralは勝率計算から除外）。
export function aggregateVerification(records: VerificationRecord[]): AggregateStats {
  const settled = records.filter((r) => r.outcome !== "pending");
  const decided = settled.filter((r) => r.outcome === "win" || r.outcome === "loss");

  const bySignal: AggregateStats["bySignal"] = {};
  for (const signal of ["買い", "売り", "待ち"]) {
    bySignal[signal] = toStats(decided.filter((r) => r.signal === signal));
  }

  const byScoreBucket: ScoreBucketStats[] = SCORE_BUCKETS.map(({ range, min, max }) => ({
    range,
    ...toStats(decided.filter((r) => r.score >= min && r.score <= max)),
  }));

  const overall = toStats(decided);
  const observed = toObservedStats(records.filter((r) => r.outcome === "observed"));

  return {
    totalRecords: records.length,
    settledCount: settled.length,
    pendingCount: records.length - settled.length,
    overallWinRate: overall.winRate,
    bySignal,
    byScoreBucket,
    observed,
  };
}
