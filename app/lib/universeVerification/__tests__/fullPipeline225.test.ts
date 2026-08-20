import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { STOCK_UNIVERSES } from "@/app/lib/screening/universes";
import { runMorningOrchestration } from "../morningOrchestration";
import { readUniverseVerificationLog } from "../store";
import { strategyA } from "@/app/lib/paperTrading/strategyAdapter";
import type { ScreenedStock } from "@/app/lib/screening/types";
import type { CachedScanLike } from "@/app/lib/paperTrading/signalSnapshotStore";

// 追加確認④：225銘柄スキャン → 225銘柄Snapshot固定 → Universe Verification 225件initialize →
// Paper Trading候補選抜、までを一気通貫で検証する。
//
// 実際のYahoo Finance通信を伴う225銘柄フルスキャンは低速・レート制限のリスクがあるため、
// ここでは「スキャンが225銘柄分正常完了した」状態と等価な固定フィクスチャ（本物の
// STOCK_UNIVERSES.nikkei225の225コードそれぞれに合成した分析結果を割り当てたもの）を
// cachedScanとして注入する。それより後段（Snapshot固定→Verification初期化→Strategy選抜）は
// 本番と全く同じ実装をそのまま通す（フィクスチャ化していない）。
// 本番データ・本番LINE・main側データは一切変更しない（隔離ディレクトリのみ使用）。
function withTempDirs<T>(fn: () => Promise<T>): Promise<T> {
  const paperDir = mkdtempSync(path.join(tmpdir(), "fullpipeline-paper-"));
  const universeDir = mkdtempSync(path.join(tmpdir(), "fullpipeline-universe-"));
  process.env.PAPER_TRADING_DATA_DIR = paperDir;
  process.env.UNIVERSE_VERIFICATION_DATA_DIR = universeDir;
  return fn().finally(() => {
    rmSync(paperDir, { recursive: true, force: true });
    rmSync(universeDir, { recursive: true, force: true });
    delete process.env.PAPER_TRADING_DATA_DIR;
    delete process.env.UNIVERSE_VERIFICATION_DATA_DIR;
  });
}

const DUMMY_INDICATOR_VALUES = {
  rsi: 55, macdLine: 1, macdSignal: 0.5, macdHistogram: 0.5,
  sma5: 100, sma25: 98, sma75: 95, ma5DiffPercent: 2, ma25DiffPercent: 4, ma75DiffPercent: 6,
};

const FIXED_DATE = "2026-08-20";
const FIXED_NOW = new Date("2026-08-20T08:35:00+09:00"); // 9:00 JST締切より前

function buildFixture225Candidates(): ScreenedStock[] {
  const codes = STOCK_UNIVERSES.nikkei225;
  assert.equal(codes.length, 225, "STOCK_UNIVERSES.nikkei225が実際に225銘柄であることの前提確認");

  return codes.map((code, index) => {
    // 買い/売り/待ちがまんべんなく混ざるようインデックスで分岐させる（本番の分布を模す合成データ）。
    const signal = index % 3 === 0 ? ("買い" as const) : index % 3 === 1 ? ("売り" as const) : ("待ち" as const);
    const price = 1000 + index;
    return {
      code,
      symbol: `${code}.T`,
      name: `銘柄${code}`,
      score: 60 + (index % 40),
      confidence: 50 + (index % 50),
      price,
      signal,
      entryPriority: index,
      risk: "中" as const,
      strategyHeadline: "",
      aiComment: "",
      entryBlock: { level: "none" as const, reason: null },
      todayAction: signal === "買い" ? ("今すぐエントリー" as const) : signal === "売り" ? ("見送り" as const) : ("様子見" as const),
      todayActionReason: "",
      reasons: [],
      entryPrice: price,
      stopLoss: Math.round(price * 0.97),
      takeProfit: Math.round(price * 1.05),
      indicatorValues: DUMMY_INDICATOR_VALUES,
    };
  });
}

function fixtureCachedScan(): CachedScanLike {
  const candidates = buildFixture225Candidates();
  return {
    dateKey: FIXED_DATE,
    scanStartedAt: `${FIXED_DATE}T08:29:30.000Z`,
    scannedAt: `${FIXED_DATE}T08:34:50.000Z`,
    scannedCount: 225,
    failedCount: 0,
    candidates,
  };
}

test("225銘柄スキャン→Snapshot固定→Verification 225件initialize→Paper Trading候補選抜が一気通貫で成立する", async () => {
  await withTempDirs(async () => {
    const startedAt = Date.now();

    const result = await runMorningOrchestration({ now: FIXED_NOW, cachedScan: fixtureCachedScan() });

    const elapsedMs = Date.now() - startedAt;

    // --- Snapshot件数が225件 ---
    assert.equal(result.snapshot.captured, true);
    assert.equal(result.snapshot.universeSize, 225);
    assert.equal(result.snapshot.succeededCount, 225);
    assert.equal(result.snapshot.failedCount, 0);

    // --- Universe Verification pendingが225件 ---
    assert.ok(result.verification);
    assert.equal(result.verification!.initialized, true);
    assert.equal(result.verification!.createdCount, 225);

    const uvLog = await readUniverseVerificationLog();
    assert.equal(uvLog.length, 225);
    assert.ok(uvLog.every((r) => r.outcome === "pending"));

    // --- SnapshotIdが225件すべて正しく紐づく ---
    const snapshotIds = new Set(uvLog.map((r) => r.snapshotId));
    assert.equal(snapshotIds.size, 225, "225件すべて別々のSnapshotIdを持つ");
    for (const record of uvLog) {
      assert.equal(record.snapshotId, `${FIXED_DATE}-${record.code}`);
      assert.equal(record.id, record.snapshotId);
    }

    // --- BUY/SELL/WAIT件数の合計が225 ---
    const buyCount = uvLog.filter((r) => r.signal === "買い").length;
    const sellCount = uvLog.filter((r) => r.signal === "売り").length;
    const waitCount = uvLog.filter((r) => r.signal === "待ち").length;
    assert.equal(buyCount + sellCount + waitCount, 225);
    assert.ok(buyCount > 0 && sellCount > 0 && waitCount > 0, "3種のシグナルすべてが実際に含まれる");

    // --- Strategy Versionが225件すべて保存 ---
    assert.ok(uvLog.every((r) => typeof r.strategyVersion === "string" && r.strategyVersion.length > 0));

    // --- Paper TradingとVerificationが同一Snapshotを参照 ---
    // strategyA.decide()は既存Paper Trading本番コードそのもの（フィクスチャ化していない）。
    const snapshotRows = await (await import("@/app/lib/paperTrading/signalSnapshotStore")).getSignalSnapshotRows(FIXED_DATE);
    assert.equal(snapshotRows.length, 225);
    const decision = strategyA.decide({ snapshotRows, openPositions: [] });
    assert.equal(decision.buyCandidates.length, buyCount, "Paper Trading候補選抜のBUY候補数はVerification側のBUY件数と一致する");
    for (const candidate of decision.buyCandidates) {
      const uvRecord = uvLog.find((r) => r.code === candidate.code)!;
      assert.equal(candidate.snapshotId, uvRecord.snapshotId, "Paper TradingとVerificationが同一SignalSnapshotを参照している");
    }

    // --- 再実行してもSnapshot/Verificationが二重生成されない ---
    const rerun = await runMorningOrchestration({ now: FIXED_NOW, cachedScan: fixtureCachedScan() });
    assert.equal(rerun.verification!.createdCount, 0);
    assert.equal(rerun.verification!.alreadyExistedCount, 225);
    const uvLogAfterRerun = await readUniverseVerificationLog();
    assert.equal(uvLogAfterRerun.length, 225, "再実行してもレコード総数は増えない");

    // --- 処理全体が9:00以前に終わる想定時間内である ---
    // フィクスチャ駆動のためミリ秒単位で完了するが、「処理そのものが極端に長時間化しない」ことの
    // 目安として10秒以内を確認する（実本番は225回のYahoo Finance通信を伴うため別途実測が必要。
    // 本テストはオーケストレーション層のオーバーヘッドのみを対象とする）。
    assert.ok(elapsedMs < 10_000, `オーケストレーション処理自体は${elapsedMs}msで完了（十分高速）`);
  });
});
