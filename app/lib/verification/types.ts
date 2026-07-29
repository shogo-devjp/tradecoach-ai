import type { EntryTiming, IndicatorStatus, MarketCondition, Signal } from "@/app/lib/technicalAnalysis/types";

export interface DayResult {
  date: string; // YYYY-MM-DD（実際に約定日として採用した営業日）
  changePercent: number;
}

export type VerificationOutcome = "pending" | "win" | "loss" | "neutral";

export interface VerificationRecord {
  id: string; // `${code}-${judgedAt}`
  code: string;
  name: string;
  judgedAt: string; // YYYY-MM-DD（判定日）
  score: number;
  signal: Signal;
  priceAtJudgment: number;
  // AIが外れた理由を後から分析できるよう、判定時点の主要な材料も保存しておく
  // （将来のスコア配点調整のための学習データ）。
  marketCondition: MarketCondition;
  dowTheoryStatus: IndicatorStatus;
  atrPercent: number;
  volumeRatio: number;
  entryTiming: EntryTiming;
  day1: DayResult | null;
  day3: DayResult | null;
  day5: DayResult | null;
  outcome: VerificationOutcome;
}
