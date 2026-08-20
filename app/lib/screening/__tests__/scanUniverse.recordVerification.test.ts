import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// scanUniverse()経由でもrecordVerification:falseがanalyzeStockByCode()まで正しく伝播し、
// 既存verificationログが変化しないことを検証する（追加確認②）。
// 実際にYahoo Financeへ通信するため、225銘柄フルスケールではなく代表的な数銘柄で
// 「225銘柄相当」の経路を検証する（scanUniverse()自体のロジックは件数に依存しない
// チャンク処理のため、少数での検証で経路の正しさは十分確認できる。225件フルの
// 実ネットワーク検証は追加確認④の一気通貫テストでフィクスチャベースに別途行う）。
function withTempVerificationDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "verification-test-scanuniverse-"));
  process.env.VERIFICATION_DATA_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.VERIFICATION_DATA_DIR;
  });
}

const SAMPLE_CODES = ["7203", "6758", "9984"]; // トヨタ自動車・ソニーグループ・ソフトバンクグループ

test("scanUniverse(recordVerification:false)は既存verificationログを一切変更しない", async () => {
  await withTempVerificationDataDir(async () => {
    const { scanUniverse } = await import("../scanUniverse");
    const { getVerificationLog } = await import("../../verification/store");

    const before = await getVerificationLog();
    assert.equal(before.length, 0);

    const { candidates } = await scanUniverse(SAMPLE_CODES, 8, { recordVerification: false });
    assert.ok(candidates.length > 0, "分析自体は正常に実行される（副作用だけを止める）");

    await new Promise((resolve) => setTimeout(resolve, 500));

    const after = await getVerificationLog();
    assert.equal(after.length, 0, "recordVerification:falseがscanUniverse経由でも伝播し、verificationログは変化しない");
  });
});

test("scanUniverse()のrecordVerification未指定は既存どおりverificationログへ記録される（後方互換）", async () => {
  await withTempVerificationDataDir(async () => {
    const { scanUniverse } = await import("../scanUniverse");
    const { getVerificationLog } = await import("../../verification/store");

    await scanUniverse(SAMPLE_CODES, 8);

    let after: Awaited<ReturnType<typeof getVerificationLog>> = [];
    for (let i = 0; i < 20; i++) {
      after = await getVerificationLog();
      if (after.length >= SAMPLE_CODES.length) break;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    assert.equal(after.length, SAMPLE_CODES.length, "未指定時は既存どおり全銘柄分が記録される（本番の朝夕スキャンと同じ挙動）");
  });
});
