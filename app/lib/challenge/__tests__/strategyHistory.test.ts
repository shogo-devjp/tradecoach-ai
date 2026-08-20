import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "challenge-strategy-history-test-"));
  process.env.CHALLENGE_DATA_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CHALLENGE_DATA_DIR;
  });
}

// テストケース22: Strategy変更履歴を保持する（過去のエントリを新Strategyで上書きしない）
test("recordStrategyChange()で複数バージョンを記録でき、過去のエントリは上書きされない", async () => {
  await withTempDataDir(async () => {
    const { recordStrategyChange, listStrategyHistory } = await import("../strategyHistory");

    const v1 = await recordStrategyChange({
      strategyVersion: "strategy-a-standard@1",
      effectiveFrom: "2026-08-20",
      previousVersion: null,
      changeSummary: "初期バージョン",
      reason: "チャレンジ開始",
    });
    assert.equal(v1.recorded, true);

    const v2 = await recordStrategyChange({
      strategyVersion: "strategy-a-standard@2",
      effectiveFrom: "2026-10-01",
      previousVersion: "strategy-a-standard@1",
      changeSummary: "スコア配点を調整",
      reason: "30営業日分のデータを分析した結果、RSI過熱時の減点を強化",
      dataWindowUsedForDecision: "2026-08-20〜2026-09-30（30営業日）",
    });
    assert.equal(v2.recorded, true);

    const history = await listStrategyHistory();
    assert.equal(history.length, 2);
    // v1のエントリがv2の内容で上書きされていないことを確認
    const stored1 = history.find((e) => e.strategyVersion === "strategy-a-standard@1")!;
    assert.equal(stored1.changeSummary, "初期バージョン");
    assert.equal(stored1.effectiveFrom, "2026-08-20");
    const stored2 = history.find((e) => e.strategyVersion === "strategy-a-standard@2")!;
    assert.equal(stored2.previousVersion, "strategy-a-standard@1");
    assert.equal(stored2.dataWindowUsedForDecision, "2026-08-20〜2026-09-30（30営業日）");
  });
});

test("recordStrategyChange()で同一strategyVersionを再度記録しても既存分を上書きしない（冪等）", async () => {
  await withTempDataDir(async () => {
    const { recordStrategyChange } = await import("../strategyHistory");

    const first = await recordStrategyChange({
      strategyVersion: "strategy-a-standard@1",
      effectiveFrom: "2026-08-20",
      previousVersion: null,
      changeSummary: "初期バージョン",
      reason: "チャレンジ開始",
    });

    const second = await recordStrategyChange({
      strategyVersion: "strategy-a-standard@1",
      effectiveFrom: "2026-08-20",
      previousVersion: null,
      changeSummary: "書き換えようとした内容（反映されないはず）",
      reason: "誤操作の想定",
    });

    assert.equal(second.recorded, false);
    assert.equal(second.reason, "already_recorded");
    assert.equal(second.entry.changeSummary, first.entry.changeSummary, "既存エントリの内容が保持される");
  });
});
