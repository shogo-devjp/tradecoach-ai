import { promises as fs } from "node:fs";
import path from "node:path";

export type EveningOrchestrationStep = "paper_trading_run" | "verification_settle" | "challenge_daily_record" | "milestones";

// 時間帯・非営業日ガードによって「そもそも何も試みなかった」ことを表す理由。
// failedStep（何かを試みて失敗した）とは意味が異なるため、別フィールドで区別する
// （運用上、監視やアラートの扱いを分けられるようにするため）。
export type EveningSkipReason = "not_a_trading_day" | "before_settle_window";

export interface EveningOrchestrationRecord {
  processedDate: string;
  paperTradingCompletedAt: string | null;
  verificationSettledAt: string | null;
  dailyRecordGeneratedAt: string | null;
  milestonesProcessedAt: string | null;
  // 到達した最後の成功ステップ（nullは①にも到達できなかったことを意味する）。
  successStep: EveningOrchestrationStep | null;
  failedStep: EveningOrchestrationStep | null;
  errorReason: string | null;
  // 時間帯・非営業日ガードにより何も実行しなかった場合のみ設定される（それ以外はnull）。
  skipReason: EveningSkipReason | null;
  // 再実行して安全か。本オーケストレーションの各段（runDaily・settle・
  // buildAndSaveDailyRecord・detectAndRecordMilestones）はいずれも同一日の再実行に対して
  // 冪等（二重約定・二重レコード・二重イベントを作らない）であることがテストで確認されているため、
  // 現状は常にtrue（失敗内容に関わらず再実行してよい）。
  retrySafe: boolean;
  updatedAt: string;
}

// challenge/store.tsと同じ思想：CHALLENGE_DATA_DIR環境変数を共有しつつ、ファイル名を分ける。
// 夕方の統合処理（Paper Trading run → Verification settle → Challenge Daily Record → Milestone）
// がどこまで進み、どこで失敗したかを日付単位で追跡するための実行ログ（Challenge本体のデータとは別物）。
function dataDir(): string {
  return (
    process.env.CHALLENGE_DATA_DIR ??
    path.join(/* turbopackIgnore: true */ process.cwd(), "app/lib/challenge/data")
  );
}

const FILE_NAME = "evening-orchestration-log.json";

function dataFile(): string {
  return path.join(dataDir(), FILE_NAME);
}

async function readAll(): Promise<EveningOrchestrationRecord[]> {
  try {
    const raw = await fs.readFile(dataFile(), "utf-8");
    return JSON.parse(raw) as EveningOrchestrationRecord[];
  } catch {
    return [];
  }
}

async function writeAll(records: EveningOrchestrationRecord[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(dataFile(), JSON.stringify(records, null, 2), "utf-8");
}

let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function getEveningOrchestrationRecord(date: string): Promise<EveningOrchestrationRecord | null> {
  const all = await readAll();
  return all.find((r) => r.processedDate === date) ?? null;
}

export async function listEveningOrchestrationRecords(): Promise<EveningOrchestrationRecord[]> {
  return readAll();
}

// 同一dateのレコードがあれば上書き更新する（実行のたびに最新の進捗・エラーを反映するだけで、
// Paper Trading・Verification・Challengeの本体データを再生成・上書きすることはない）。
export async function upsertEveningOrchestrationRecord(
  date: string,
  patch: Omit<EveningOrchestrationRecord, "processedDate" | "updatedAt">
): Promise<EveningOrchestrationRecord> {
  return enqueue(async () => {
    const all = await readAll();
    const now = new Date().toISOString();
    const next: EveningOrchestrationRecord = { processedDate: date, updatedAt: now, ...patch };
    const index = all.findIndex((r) => r.processedDate === date);
    if (index >= 0) all[index] = next;
    else all.push(next);
    await writeAll(all);
    return next;
  });
}
