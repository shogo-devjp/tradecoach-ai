import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { getTrades } from "@/app/lib/paperTrading/portfolioManager";
import { buildAndSaveDailyRecord } from "./dailyRecordBuilder";
import { detectAndRecordMilestones } from "./milestoneDetector";
import { readDailyRecords } from "./store";
import type { ChallengeDailyRecord, ChallengeEvent } from "./types";

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

export interface GenerateDailyRecordInput {
  date: string;
  strategyId?: string;
  now?: Date;
}

export interface GenerateDailyRecordResult {
  date: string;
  recordCreated: boolean;
  reason?: string;
  record: ChallengeDailyRecord | null;
  newEvents: ChallengeEvent[];
}

// §10で想定した「Paper Trading EXIT/ENTRY処理 → Universe Verification settle → Challenge Daily
// Record生成 → Milestone判定」のうち、後半2段を1回の呼び出しでまとめる薄いオーケストレーション層。
// Challenge記録（Daily Record生成・Milestone判定）が失敗しても、この関数はPaper Trading本体・
// Universe Verificationのデータには一切書き込まない（読み取りのみ）ため、失敗してもそれらの
//処理結果を破壊しない。呼び出し元（APIルート）は例外を握りつぶしてPaper Trading側の処理結果
// とは独立に扱うこと。
export async function generateDailyRecordAndMilestones(input: GenerateDailyRecordInput): Promise<GenerateDailyRecordResult> {
  const date = input.date;
  const strategyId = input.strategyId ?? STRATEGY_A_ID;

  const buildResult = await buildAndSaveDailyRecord({ date, strategyId, now: input.now });
  if (!buildResult.record) {
    return { date, recordCreated: false, reason: buildResult.reason, record: null, newEvents: [] };
  }

  // 冪等性：Daily Recordが既に存在していた場合（今回新規作成していない場合）は、
  // Milestone判定も既に過去に実行済みのはずなので再実行しない（二重記録防止の二重の保険）。
  if (!buildResult.created) {
    return { date, recordCreated: false, reason: buildResult.reason, record: buildResult.record, newEvents: [] };
  }

  const [previousRecords, allTrades] = await Promise.all([readDailyRecords(), getTrades(strategyId)]);
  const priorRecords = previousRecords.filter((r) => r.date < date);
  const cumulativeTradesOrderedAsc = allTrades
    .filter((t) => dateOf(t.exitAt) <= date)
    .sort((a, b) => a.exitAt.localeCompare(b.exitAt));

  const newEvents = await detectAndRecordMilestones({
    record: buildResult.record,
    previousRecords: priorRecords,
    cumulativeTradesOrderedAsc,
  });

  return { date, recordCreated: true, record: buildResult.record, newEvents };
}
