import { enqueue, readJson, writeJson } from "./store";
import type { SignalSnapshot, SnapshotCaptureResult } from "./types";
import type { ScreenedStock } from "../screening/types";

const SNAPSHOTS_FILE = "signal-snapshots.json";

// Snapshot捕捉は9:00 JSTより前に完了することが条件（設計書§7）。
const MARKET_OPEN_DEADLINE_HHMM = "09:00";

// 失敗件数の許容閾値（対象銘柄数に対する割合）。これを超える場合はデータ品質不良として
// fail-safeでその日のSnapshotを作成しない。
const MAX_FAILURE_RATIO = 0.05;

interface SnapshotStoreShape {
  captureResults: SnapshotCaptureResult[];
  snapshots: SignalSnapshot[];
}

function todayKeyJst(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function nowHhmmJst(now: Date = new Date()): string {
  return now.toLocaleTimeString("sv-SE", { timeZone: "Asia/Tokyo", hour12: false }).slice(0, 5);
}

async function readStore(): Promise<SnapshotStoreShape> {
  return readJson<SnapshotStoreShape>(SNAPSHOTS_FILE, { captureResults: [], snapshots: [] });
}

async function writeStore(shape: SnapshotStoreShape): Promise<void> {
  await writeJson(SNAPSHOTS_FILE, shape);
}

export interface CachedScanLike {
  dateKey: string;
  scanStartedAt: string;
  scannedAt: string;
  scannedCount: number;
  failedCount: number;
  candidates: ScreenedStock[];
}

export interface CaptureSnapshotInput {
  cachedScan: CachedScanLike | null;
  strategyVersion: string;
  now?: Date;
}

// 朝スクリーニングが正常完了したことを確認した直後に呼ぶ。当日分が既に存在する場合は
// 何もしない（上書き禁止）。品質チェックを満たさない場合はfail-safeでcaptured:falseを返し、
// その日は新規BUYなしとして扱う（保有中ポジションのSL/TP判定はSnapshotに依存しないため
// 引き続き実行できる）。
export async function captureSignalSnapshot(input: CaptureSnapshotInput): Promise<SnapshotCaptureResult> {
  return enqueue(SNAPSHOTS_FILE, async () => {
    const now = input.now ?? new Date();
    const date = todayKeyJst(now);
    const store = await readStore();

    // --- 上書き禁止: 当日分が既に存在すれば何もせず返す ---
    const existing = store.captureResults.find((r) => r.date === date);
    if (existing) return existing;

    const nowHhmm = nowHhmmJst(now);
    const capturedAtIso = now.toISOString();

    const fail = async (reason: SnapshotCaptureResult["reason"], meta?: Partial<SnapshotCaptureResult>): Promise<SnapshotCaptureResult> => {
      const result: SnapshotCaptureResult = { date, captured: false, reason, capturedAt: null, ...meta };
      store.captureResults.push(result);
      await writeStore(store);
      return result;
    };

    // --- fail-safe①: 9:00 JSTを過ぎている場合は捕捉しない ---
    if (nowHhmm >= MARKET_OPEN_DEADLINE_HHMM) {
      return fail("after_market_open");
    }

    // --- fail-safe②: getCachedScan()が当日分を返さない（サーバー再起動等） ---
    const cachedScan = input.cachedScan;
    if (!cachedScan || cachedScan.dateKey !== date) {
      return fail("cache_unavailable");
    }

    const universeSize = cachedScan.scannedCount;
    const succeededCount = cachedScan.candidates.length;
    const failedCount = cachedScan.failedCount;

    // --- fail-safe③: スキャンが未完了（結果件数が対象数に届いていない） ---
    if (succeededCount + failedCount < universeSize) {
      return fail("incomplete_scan", { universeSize, succeededCount, failedCount, scanCompletedAt: cachedScan.scannedAt });
    }

    // --- fail-safe④: 失敗件数が許容閾値を超えている ---
    if (universeSize > 0 && failedCount / universeSize > MAX_FAILURE_RATIO) {
      return fail("too_many_failures", { universeSize, succeededCount, failedCount, scanCompletedAt: cachedScan.scannedAt });
    }

    // --- すべて満たした場合のみ、その時点の全候補をそのままコピーして凍結する ---
    const rows: SignalSnapshot[] = cachedScan.candidates.map((c) => ({
      id: `${date}-${c.code}`,
      date,
      analyzedAt: cachedScan.scannedAt,
      scanStartedAt: cachedScan.scanStartedAt,
      snapshotCapturedAt: capturedAtIso,
      scanCompletedAt: cachedScan.scannedAt,
      universeSize,
      succeededCount,
      failedCount,
      code: c.code,
      name: c.name,
      signal: c.signal,
      score: c.score,
      confidence: c.confidence,
      todayAction: c.todayAction,
      priceAtJudgment: c.price,
      entryPriceCandidate: c.entryPrice,
      stopLoss: c.stopLoss,
      takeProfit: c.takeProfit,
      entryBlockLevel: c.entryBlock.level,
      riskLevel: c.risk,
      strategyVersion: input.strategyVersion,
      sourceScannedAt: cachedScan.scannedAt,
      indicatorValues: c.indicatorValues,
    }));

    store.snapshots.push(...rows);
    const result: SnapshotCaptureResult = {
      date,
      captured: true,
      capturedAt: capturedAtIso,
      universeSize,
      succeededCount,
      failedCount,
      scanCompletedAt: cachedScan.scannedAt,
    };
    store.captureResults.push(result);
    await writeStore(store);
    return result;
  });
}

export async function getSnapshotCaptureResult(date: string): Promise<SnapshotCaptureResult | null> {
  const store = await readStore();
  return store.captureResults.find((r) => r.date === date) ?? null;
}

export async function getSignalSnapshotRows(date: string): Promise<SignalSnapshot[]> {
  const store = await readStore();
  return store.snapshots.filter((s) => s.date === date);
}

export async function getSignalSnapshotForCode(date: string, code: string): Promise<SignalSnapshot | null> {
  const rows = await getSignalSnapshotRows(date);
  return rows.find((r) => r.code === code) ?? null;
}
