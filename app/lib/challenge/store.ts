import { promises as fs } from "node:fs";
import path from "node:path";
import type { ChallengeDailyRecord, ChallengeEvent, ChallengeMeta, ChallengeStrategyHistoryEntry } from "./types";

// paperTrading/store.ts・universeVerification/store.tsと同じ思想：個人利用・無料運用前提のため
// 外部DBは使わずローカルJSONファイルに保存する。Paper Trading・225銘柄Verification・
// 既存30銘柄Verificationとは完全に独立したディレクトリ・ファイルにし、本モジュールの読み書きが
// それらの処理へ一切波及しないようにする（読み取り・記録レイヤーとしての独立性）。
//
// CHALLENGE_DATA_DIR環境変数でデータディレクトリを差し替え可能（テスト専用）。
// 呼び出しの都度読み直す（トップレベル定数にすると、テスト側がimport前にenvを設定しても
// 間に合わないため。他モジュールと同じ理由）。
function dataDir(): string {
  return (
    process.env.CHALLENGE_DATA_DIR ??
    path.join(/* turbopackIgnore: true */ process.cwd(), "app/lib/challenge/data")
  );
}

const CHALLENGE_FILE = "challenge.json";
const DAILY_RECORDS_FILE = "daily-records.json";
const EVENTS_FILE = "events.json";
const STRATEGY_HISTORY_FILE = "strategy-history.json";

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(dataDir(), name), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(name: string, value: T): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(path.join(dataDir(), name), JSON.stringify(value, null, 2), "utf-8");
}

// ファイルごとに独立した書き込みキュー（paperTrading/store.tsと同じ考え方）。
const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(name: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(name) ?? Promise.resolve();
  const result = previous.then(task, task);
  writeQueues.set(
    name,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}

// --- Challenge（1件のみ） ---

export async function readChallengeMeta(): Promise<ChallengeMeta | null> {
  return readJson<ChallengeMeta | null>(CHALLENGE_FILE, null);
}

export async function writeChallengeMeta(meta: ChallengeMeta): Promise<void> {
  await enqueue(CHALLENGE_FILE, () => writeJson(CHALLENGE_FILE, meta));
}

// --- Daily Records ---

export async function readDailyRecords(): Promise<ChallengeDailyRecord[]> {
  const all = await readJson<ChallengeDailyRecord[]>(DAILY_RECORDS_FILE, []);
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getDailyRecord(date: string): Promise<ChallengeDailyRecord | null> {
  const all = await readDailyRecords();
  return all.find((r) => r.date === date) ?? null;
}

// 冪等性：同一dateのレコードが既に存在する場合は上書きしない（過去の確定データを
// 現在のAI判断・現在の集計で書き換えない、という§8の要件をそのまま満たす）。
// 呼び出し元でこの関数を呼ぶ前に既存有無を確認する設計にしているが、念のためここでも
// 二重に保護する。
export async function appendDailyRecordIfAbsent(record: ChallengeDailyRecord): Promise<{ appended: boolean }> {
  return enqueue(DAILY_RECORDS_FILE, async () => {
    const all = await readJson<ChallengeDailyRecord[]>(DAILY_RECORDS_FILE, []);
    if (all.some((r) => r.date === record.date)) {
      return { appended: false };
    }
    all.push(record);
    await writeJson(DAILY_RECORDS_FILE, all);
    return { appended: true };
  });
}

// --- Events（Milestone） ---

export async function readEvents(): Promise<ChallengeEvent[]> {
  const all = await readJson<ChallengeEvent[]>(EVENTS_FILE, []);
  return all.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

// 冪等性：同一eventIdは二重記録しない。
export async function appendEventIfAbsent(event: ChallengeEvent): Promise<{ appended: boolean }> {
  return enqueue(EVENTS_FILE, async () => {
    const all = await readJson<ChallengeEvent[]>(EVENTS_FILE, []);
    if (all.some((e) => e.eventId === event.eventId)) {
      return { appended: false };
    }
    all.push(event);
    await writeJson(EVENTS_FILE, all);
    return { appended: true };
  });
}

// --- Strategy History ---

export async function readStrategyHistory(): Promise<ChallengeStrategyHistoryEntry[]> {
  const all = await readJson<ChallengeStrategyHistoryEntry[]>(STRATEGY_HISTORY_FILE, []);
  return all.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

// 冪等性・不変性：同一strategyVersion（= id）のエントリは既存があれば追加しない。
// 過去のStrategy変更履歴を新しいエントリで上書きすることは一切ない（追記専用）。
export async function appendStrategyHistoryIfAbsent(
  entry: ChallengeStrategyHistoryEntry
): Promise<{ appended: boolean }> {
  return enqueue(STRATEGY_HISTORY_FILE, async () => {
    const all = await readJson<ChallengeStrategyHistoryEntry[]>(STRATEGY_HISTORY_FILE, []);
    if (all.some((e) => e.id === entry.id)) {
      return { appended: false };
    }
    all.push(entry);
    await writeJson(STRATEGY_HISTORY_FILE, all);
    return { appended: true };
  });
}
