import { appendStrategyHistoryIfAbsent, readStrategyHistory } from "./store";
import type { ChallengeStrategyHistoryEntry } from "./types";

export interface RecordStrategyChangeInput {
  strategyVersion: string;
  effectiveFrom: string; // YYYY-MM-DD
  previousVersion: string | null;
  changeSummary: string;
  reason: string;
  dataWindowUsedForDecision?: string | null;
  now?: Date;
}

export interface RecordStrategyChangeResult {
  recorded: boolean;
  reason?: "already_recorded";
  entry: ChallengeStrategyHistoryEntry;
}

// Strategy変更は半年の検証期間中に発生しうる重要イベントのため、人間の判断で明示的に記録する
// （朝夕の自動処理からは呼ばない）。過去のエントリを上書きすることは一切なく、
// 同一strategyVersionの再記録は冪等（appendStrategyHistoryIfAbsentが二重登録を防ぐ）。
export async function recordStrategyChange(input: RecordStrategyChangeInput): Promise<RecordStrategyChangeResult> {
  const now = input.now ?? new Date();
  const entry: ChallengeStrategyHistoryEntry = {
    id: input.strategyVersion,
    strategyVersion: input.strategyVersion,
    effectiveFrom: input.effectiveFrom,
    previousVersion: input.previousVersion,
    changeSummary: input.changeSummary,
    reason: input.reason,
    dataWindowUsedForDecision: input.dataWindowUsedForDecision ?? null,
    recordedAt: now.toISOString(),
  };
  const result = await appendStrategyHistoryIfAbsent(entry);
  if (!result.appended) {
    const existing = (await readStrategyHistory()).find((e) => e.id === entry.id)!;
    return { recorded: false, reason: "already_recorded", entry: existing };
  }
  return { recorded: true, entry };
}

export async function listStrategyHistory(): Promise<ChallengeStrategyHistoryEntry[]> {
  return readStrategyHistory();
}
