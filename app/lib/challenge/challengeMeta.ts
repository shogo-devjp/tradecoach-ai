import { STRATEGY_A_ID, STRATEGY_A_VERSION } from "@/app/lib/paperTrading/config";
import { readChallengeMeta, writeChallengeMeta } from "./store";
import type { ChallengeMeta } from "./types";

export const CHALLENGE_ID = "ai-500k-challenge-strategy-a-standard-paper";
export const CHALLENGE_NAME = "AI資産運用50万円チャレンジ";
export const CHALLENGE_INITIAL_CAPITAL = 500_000;

// 準備状態のChallengeを作成する（既に存在する場合はそのまま返す。上書きしない）。
// startedAtはまだ確定しない（status: "preparing"）。本稼働開始時にactivateChallenge()を
// 呼ぶまでnullのまま保持する。
export async function ensureChallengeInitialized(): Promise<ChallengeMeta> {
  const existing = await readChallengeMeta();
  if (existing) return existing;

  const now = new Date().toISOString();
  const meta: ChallengeMeta = {
    challengeId: CHALLENGE_ID,
    challengeName: CHALLENGE_NAME,
    initialCapital: CHALLENGE_INITIAL_CAPITAL,
    startedAt: null,
    strategyId: STRATEGY_A_ID,
    strategyVersion: STRATEGY_A_VERSION,
    universe: "nikkei225",
    benchmarkSymbol: "^N225",
    benchmarkMethod: "price_return",
    benchmarkVersion: 1,
    paperTrading: true,
    status: "preparing",
    createdAt: now,
    updatedAt: now,
  };
  await writeChallengeMeta(meta);
  return meta;
}

export interface ActivateChallengeResult {
  activated: boolean;
  reason?: "already_active" | "not_initialized";
  meta: ChallengeMeta | null;
}

// 本稼働開始日をstartedAtとして一度だけ確定する。既にstatus:"active"の場合は何もしない
// （startedAtの上書きは絶対に行わない＝冪等）。今回のタスクではこの関数を呼び出さない
// （本稼働開始はまだ行わないため）。テストで動作のみ検証する。
export async function activateChallenge(now: Date = new Date()): Promise<ActivateChallengeResult> {
  const existing = await readChallengeMeta();
  if (!existing) {
    return { activated: false, reason: "not_initialized", meta: null };
  }
  if (existing.status === "active" || existing.startedAt) {
    return { activated: false, reason: "already_active", meta: existing };
  }

  const updated: ChallengeMeta = {
    ...existing,
    startedAt: now.toISOString(),
    status: "active",
    updatedAt: now.toISOString(),
  };
  await writeChallengeMeta(updated);
  return { activated: true, meta: updated };
}
