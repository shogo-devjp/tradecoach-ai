import { promises as fs } from "node:fs";
import path from "node:path";
import type { EntryTiming, IndicatorStatus, MarketCondition, Signal } from "@/app/lib/technicalAnalysis/types";
import type { VerificationRecord } from "./types";

// 個人利用・無料運用が前提のため、外部DBは使わずサーバーのローカルJSONファイルに保存する。
// 将来サーバーレス環境（Vercel等）にデプロイする場合はファイルシステムが永続化されないため、
// Vercel KV/Supabase等の無料枠DBに置き換える必要がある。
const DATA_DIR = path.join(process.cwd(), "app/lib/verification/data");
const DATA_FILE = path.join(DATA_DIR, "log.json");

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

async function readLog(): Promise<VerificationRecord[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as VerificationRecord[];
  } catch {
    return [];
  }
}

async function writeLog(records: VerificationRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(records, null, 2), "utf-8");
}

// scanUniverse.tsは複数銘柄を並行分析するため、read-modify-writeが重ならないよう
// 同一プロセス内での書き込みを直列化する（さもないと後勝ちで記録が失われうる）。
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(task, task);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export interface NewJudgment {
  code: string;
  name: string;
  score: number;
  signal: Signal;
  price: number;
  marketCondition: MarketCondition;
  dowTheoryStatus: IndicatorStatus;
  atrPercent: number;
  volumeRatio: number;
  entryTiming: EntryTiming;
}

// 同一銘柄・同日の判定は上書きする（1日に何度分析しても重複記録しない）。
// 既に確定済みの day1/day3/day5/outcome があれば保持し、スコア・シグナルの最新値だけ更新する。
export async function recordJudgment(judgment: NewJudgment): Promise<void> {
  await enqueue(async () => {
    const judgedAt = todayKey();
    const id = `${judgment.code}-${judgedAt}`;
    const records = await readLog();
    const existingIndex = records.findIndex((r) => r.id === id);

    const base: VerificationRecord = {
      id,
      code: judgment.code,
      name: judgment.name,
      judgedAt,
      score: judgment.score,
      signal: judgment.signal,
      priceAtJudgment: judgment.price,
      marketCondition: judgment.marketCondition,
      dowTheoryStatus: judgment.dowTheoryStatus,
      atrPercent: judgment.atrPercent,
      volumeRatio: judgment.volumeRatio,
      entryTiming: judgment.entryTiming,
      day1: null,
      day3: null,
      day5: null,
      outcome: "pending",
    };

    if (existingIndex >= 0) {
      const existing = records[existingIndex];
      records[existingIndex] = {
        ...base,
        day1: existing.day1,
        day3: existing.day3,
        day5: existing.day5,
        outcome: existing.outcome,
      };
    } else {
      records.push(base);
    }

    await writeLog(records);
  });
}

export async function getVerificationLog(): Promise<VerificationRecord[]> {
  return readLog();
}

export async function updateRecords(records: VerificationRecord[]): Promise<void> {
  await enqueue(() => writeLog(records));
}
