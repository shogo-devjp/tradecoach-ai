import { promises as fs } from "node:fs";
import path from "node:path";
import { PAPER_TRADING_CONFIG } from "./config";
import type { ClosedTrade, PaperTradingState, SkippedSignal } from "./types";

// 株式版 app/lib/verification/store.ts と同じ「ローカルJSON＋同一プロセス内書き込み
// キュー直列化」の手法をFX専用に独立実装したもの（ファイルそのものは共有しない）。
// 個人利用・無料運用前提のため外部DBは使わず、サーバーのローカルJSONファイルに保存する。
// 将来サーバーレス環境に載せる場合はこの永続化層だけ差し替えれば良い設計にしている。
const DATA_DIR = path.join(process.cwd(), "app/lib/fx/paperTrading/data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const TRADES_FILE = path.join(DATA_DIR, "trades.json");
const SKIPPED_FILE = path.join(DATA_DIR, "skipped.json");

function defaultState(): PaperTradingState {
  return {
    equity: PAPER_TRADING_CONFIG.initialEquityJPY,
    pendingSignal: null,
    position: null,
    lastTickAt: null,
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf-8");
}

// scanUniverse等と同様、複数tickが重なって同時に書き込むことは想定していないが、
// 将来的な保険として同一プロセス内の書き込みを直列化しておく。
let writeQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export async function loadState(): Promise<PaperTradingState> {
  return readJson<PaperTradingState>(STATE_FILE, defaultState());
}

export async function saveState(state: PaperTradingState): Promise<void> {
  await enqueue(() => writeJson(STATE_FILE, state));
}

export async function loadTrades(): Promise<ClosedTrade[]> {
  return readJson<ClosedTrade[]>(TRADES_FILE, []);
}

export async function appendTrade(trade: ClosedTrade): Promise<void> {
  await enqueue(async () => {
    const trades = await readJson<ClosedTrade[]>(TRADES_FILE, []);
    trades.push(trade);
    await writeJson(TRADES_FILE, trades);
  });
}

export async function loadSkipped(): Promise<SkippedSignal[]> {
  return readJson<SkippedSignal[]>(SKIPPED_FILE, []);
}

export async function appendSkipped(skipped: SkippedSignal): Promise<void> {
  await enqueue(async () => {
    const list = await readJson<SkippedSignal[]>(SKIPPED_FILE, []);
    list.push(skipped);
    await writeJson(SKIPPED_FILE, list);
  });
}

// テスト・ドライラン用に状態を初期化し直すためのヘルパー（本番運用では使わない想定）。
export async function resetForTesting(): Promise<void> {
  await enqueue(async () => {
    await writeJson(STATE_FILE, defaultState());
    await writeJson(TRADES_FILE, []);
    await writeJson(SKIPPED_FILE, []);
  });
}
