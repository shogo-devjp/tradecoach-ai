import { promises as fs } from "node:fs";
import path from "node:path";
import type { UniverseVerificationRecord } from "./types";

// 既存verification/store.ts・paperTrading/store.tsと同じ思想：個人利用・無料運用が前提のため
// 外部DBは使わずローカルJSONファイルに保存する。既存30銘柄verification（app/lib/verification/data/）
// ともPaper Trading（app/lib/paperTrading/data/）とも完全に独立したディレクトリにする。
//
// UNIVERSE_VERIFICATION_DATA_DIR環境変数でデータディレクトリを差し替え可能（テスト専用）。
// 呼び出しの都度読み直す（paperTrading/store.tsと同じ理由：静的importの評価順対策）。
function dataDir(): string {
  return (
    process.env.UNIVERSE_VERIFICATION_DATA_DIR ??
    path.join(/* turbopackIgnore: true */ process.cwd(), "app/lib/universeVerification/data")
  );
}

const DATA_FILE_NAME = "log.json";

function dataFile(): string {
  return path.join(dataDir(), DATA_FILE_NAME);
}

export async function readUniverseVerificationLog(): Promise<UniverseVerificationRecord[]> {
  try {
    const raw = await fs.readFile(dataFile(), "utf-8");
    return JSON.parse(raw) as UniverseVerificationRecord[];
  } catch {
    return [];
  }
}

// enqueue()に包まれた処理の中から直接呼ぶ用（ロックを取り直さない生の書き込み）。
// enqueue()自体は非再入（nestすると初期化処理が自分自身の完了待ちでデッドロックする）のため、
// 既にenqueue()内にいるinitialize.ts側はこちらを直接使う。
export async function writeUniverseVerificationLogRaw(records: UniverseVerificationRecord[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(dataFile(), JSON.stringify(records, null, 2), "utf-8");
}

// 同一プロセス内での書き込みが重ならないよう直列化する（既存verification/store.tsのenqueueと同じ考え方）。
// 注意：この関数は非再入。enqueue()でラップされたタスクの中から再度enqueue()を呼ぶと、
// 内側の呼び出しが外側の完了を待ち続け、外側も内側の完了を待つためデッドロックする。
let writeQueue: Promise<unknown> = Promise.resolve();

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

// 単独の書き込み（settle.ts等、enqueue()の外から呼ばれる場合用）。
export async function updateUniverseVerificationRecords(records: UniverseVerificationRecord[]): Promise<void> {
  await enqueue(() => writeUniverseVerificationLogRaw(records));
}
