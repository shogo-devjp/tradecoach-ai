import { promises as fs } from "node:fs";
import path from "node:path";

// verification/store.ts と同じ思想：個人利用・無料運用が前提のため外部DBは使わず、
// サーバーのローカルJSONファイルに保存する。verificationとは完全に独立したディレクトリにし、
// 書き込み競合・読み書き順序の問題が既存機能へ波及しないようにする。
//
// PAPER_TRADING_DATA_DIR環境変数でデータディレクトリを差し替え可能にしてある
// （テスト実行時に本番データを汚さないため。node:testからのみ利用する想定）。
// ESMの静的importはモジュール本体の評価より先に走るため、値は呼び出しの都度読み直す
// （トップレベル定数にすると、テスト側がimport前にenvを設定しても間に合わない）。
// verification/store.tsのDATA_DIRと同じ形（process.cwd()と静的な相対パスのみ）にし、
// Next.js(Turbopack)のビルド時ファイルトレースが不必要にプロジェクト全体へ広がらないようにする
// （process.env参照と`??`演算子を同じ式に混ぜると、トレーサーが経路を静的に解決できず
// プロジェクト全体をトレース対象にしてしまう挙動が確認されたため、既定値を分離した）。
const DEFAULT_DATA_DIR = path.join(process.cwd(), "app/lib/paperTrading/data");

export function dataDir(): string {
  return process.env.PAPER_TRADING_DATA_DIR ?? DEFAULT_DATA_DIR;
}

export function dataFile(name: string): string {
  return path.join(dataDir(), name);
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(dataFile(name), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(name: string, value: T): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(dataFile(name), JSON.stringify(value, null, 2), "utf-8");
}

// 同一プロセス内での書き込みが重ならないよう直列化する（verification/store.tsのenqueueと同じ考え方）。
// ファイル名ごとに独立したキューにし、異なるファイルへの書き込みが互いをブロックしないようにする。
const writeQueues = new Map<string, Promise<unknown>>();

export function enqueue<T>(name: string, task: () => Promise<T>): Promise<T> {
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
