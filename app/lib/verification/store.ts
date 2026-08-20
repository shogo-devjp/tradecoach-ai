import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  EntryBlockLevel,
  EntryTiming,
  IndexCondition,
  IndicatorRawValues,
  IndicatorStatus,
  MarketCondition,
  RiskLevel,
  Signal,
  TodayAction,
  TrendDirection,
} from "@/app/lib/technicalAnalysis/types";
import type { VerificationRecord } from "./types";

// 個人利用・無料運用が前提のため、外部DBは使わずサーバーのローカルJSONファイルに保存する。
// 将来サーバーレス環境（Vercel等）にデプロイする場合はファイルシステムが永続化されないため、
// Vercel KV/Supabase等の無料枠DBに置き換える必要がある。
//
// VERIFICATION_DATA_DIR環境変数でデータディレクトリを差し替え可能にしてある（テスト専用。
// 本番では設定しないため挙動は変わらない）。Paper Trading Phase1で本番verificationログが
// 開発測定によって汚染された反省を踏まえ、recordVerification:falseのテストを本番データに
// 触れずに実施できるようにするための追加（app/lib/paperTrading/store.tsと同じパターン）。
function dataDir(): string {
  return process.env.VERIFICATION_DATA_DIR ?? path.join(process.cwd(), "app/lib/verification/data");
}

function dataFile(): string {
  return path.join(dataDir(), "log.json");
}

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

async function readLog(): Promise<VerificationRecord[]> {
  try {
    const raw = await fs.readFile(dataFile(), "utf-8");
    return JSON.parse(raw) as VerificationRecord[];
  } catch {
    return [];
  }
}

async function writeLog(records: VerificationRecord[]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(dataFile(), JSON.stringify(records, null, 2), "utf-8");
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

  // Version 1.2で追加。すべてoptional（呼び出し元がまだ渡せない場合でも動作するように）。
  indicatorValues?: IndicatorRawValues;
  entryBlockLevel?: EntryBlockLevel;
  entryBlockReason?: string | null;
  riskLevel?: RiskLevel;
  todayAction?: TodayAction;
  todayActionReason?: string;
  marketRegimeDetail?: { nikkei225: IndexCondition; topix: IndexCondition };
  trend60m?: TrendDirection | null;
  trend15m?: TrendDirection | null;
  earningsDate?: string | null;
  daysFromEarnings?: number | null;
  earningsRiskFlag?: boolean;
  earningsIsEstimate?: boolean;
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
      indicatorValues: judgment.indicatorValues,
      entryBlockLevel: judgment.entryBlockLevel,
      entryBlockReason: judgment.entryBlockReason,
      riskLevel: judgment.riskLevel,
      todayAction: judgment.todayAction,
      todayActionReason: judgment.todayActionReason,
      marketRegimeDetail: judgment.marketRegimeDetail,
      trend60m: judgment.trend60m,
      trend15m: judgment.trend15m,
      earningsDate: judgment.earningsDate,
      daysFromEarnings: judgment.daysFromEarnings,
      earningsRiskFlag: judgment.earningsRiskFlag,
      earningsIsEstimate: judgment.earningsIsEstimate,
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
