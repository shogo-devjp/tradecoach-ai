import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// VERIFICATION_DATA_DIRはverification/store.tsが呼び出しの都度読み直すため（モジュール読み込み
// 時点では参照しない設計）、各testの実行前に設定すれば足りる。本番のverification/data/log.json
// には一切触れない（Paper Trading Phase1で本番ログが汚染された反省を踏まえたテスト設計）。
function withTempVerificationDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "verification-test-"));
  process.env.VERIFICATION_DATA_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.VERIFICATION_DATA_DIR;
  });
}

// 実際にanalyzeStockByCode()を呼ぶ（Yahoo Financeへの実通信を伴う）ため、ネットワーク状況により
// 数秒〜十数秒かかる。verification/data/log.jsonへの副作用の有無を検証することが目的のため、
// 分析結果そのものの正しさ（スコア・シグナル等）は別途既存の技術分析ロジック側のテスト対象とする。
const CODE = "7203"; // トヨタ自動車。流動性が高く安定して取得できる銘柄として選定

// テスト1: recordVerification=falseで既存verificationログが変化しない
test("recordVerification:false の場合、verificationログに一切書き込まれない", async () => {
  await withTempVerificationDataDir(async () => {
    const { analyzeStockByCode } = await import("../stockAnalysis");
    const { getVerificationLog } = await import("../verification/store");

    const before = await getVerificationLog();
    assert.equal(before.length, 0, "テスト用の一時ディレクトリは最初は空のはず");

    await analyzeStockByCode(CODE, { includeIntraday: false, recordVerification: false });

    // recordJudgment()は失敗を握りつぶしてfire-and-forgetで呼ばれるため、
    // 万一裏で書き込みが走っていた場合でも検知できるよう少し待ってから確認する。
    await new Promise((resolve) => setTimeout(resolve, 500));

    const after = await getVerificationLog();
    assert.equal(after.length, 0, "recordVerification:falseの場合、verificationログは一切変更されない");
  });
});

// テスト2: recordVerification未指定では既存どおり記録される（デフォルトtrue・後方互換）
test("recordVerification未指定の場合、既存どおりverificationログへ記録される（デフォルトtrue）", async () => {
  await withTempVerificationDataDir(async () => {
    const { analyzeStockByCode } = await import("../stockAnalysis");
    const { getVerificationLog } = await import("../verification/store");

    await analyzeStockByCode(CODE, { includeIntraday: false });

    // recordJudgment()はfire-and-forgetのため、書き込み完了をポーリングで待つ
    // （既存のverification/store.tsのenqueue直列化キューが実際に処理を終えるまで）。
    let after: Awaited<ReturnType<typeof getVerificationLog>> = [];
    for (let i = 0; i < 20; i++) {
      after = await getVerificationLog();
      if (after.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    assert.equal(after.length, 1, "オプション未指定（デフォルトtrue）では既存どおり1件記録される");
    assert.equal(after[0]!.code, CODE);
  });
});
