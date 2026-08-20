import { promises as fs } from "node:fs";
import path from "node:path";
import type { MorningOrchestrationRecord } from "./types";

// universeVerification/store.ts と同じ思想：独立したローカルJSONファイル・独立したディレクトリ
// （UNIVERSE_VERIFICATION_DATA_DIR環境変数を共有するが、ファイル名は分ける）。
// 「①スキャン開始 ②スキャン完了 ③Snapshot固定 ④Verification初期化」という朝処理の
// 各段階が実際にいつ・どう完了したかを日付単位で1件だけ記録する（監査・dry-run確認用）。
function dataDir(): string {
  return (
    process.env.UNIVERSE_VERIFICATION_DATA_DIR ??
    path.join(/* turbopackIgnore: true */ process.cwd(), "app/lib/universeVerification/data")
  );
}

const DATA_FILE_NAME = "orchestration-log.json";

function dataFile(): string {
  return path.join(dataDir(), DATA_FILE_NAME);
}

async function readAll(): Promise<MorningOrchestrationRecord[]> {
  try {
    const raw = await fs.readFile(dataFile(), "utf-8");
    return JSON.parse(raw) as MorningOrchestrationRecord[];
  } catch {
    return [];
  }
}

async function writeAll(records: MorningOrchestrationRecord[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(dataFile(), JSON.stringify(records, null, 2), "utf-8");
}

// 同一プロセス内での書き込み直列化（store.tsのenqueue()と同じ考え方。専用キューにする）。
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function getMorningOrchestrationRecord(date: string): Promise<MorningOrchestrationRecord | null> {
  const records = await readAll();
  return records.find((r) => r.date === date) ?? null;
}

export async function listMorningOrchestrationRecords(): Promise<MorningOrchestrationRecord[]> {
  return readAll();
}

// 同一dateのレコードがあれば上書き更新（進捗の反映のみ。Snapshot/Verification本体の
// 再生成や上書きはしない）。無ければ新規作成する。
export async function upsertMorningOrchestrationRecord(
  date: string,
  patch: Omit<MorningOrchestrationRecord, "date" | "updatedAt">
): Promise<MorningOrchestrationRecord> {
  return enqueue(async () => {
    const records = await readAll();
    const now = new Date().toISOString();
    const next: MorningOrchestrationRecord = { date, updatedAt: now, ...patch };
    const index = records.findIndex((r) => r.date === date);
    if (index >= 0) {
      records[index] = next;
    } else {
      records.push(next);
    }
    await writeAll(records);
    return next;
  });
}
