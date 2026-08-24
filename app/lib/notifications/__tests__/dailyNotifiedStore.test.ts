import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hasNotifiedToday, markNotifiedToday, notifyOnceToday } from "../dailyNotifiedStore";

function withIsolatedStateDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "line-notified-store-"));
  process.env.NOTIFICATION_STATE_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.NOTIFICATION_STATE_DIR;
  });
}

const FIXED_NOW = new Date("2026-08-21T08:35:00+09:00");

test("kind省略時（デフォルト）は従来どおり line-notified-YYYY-MM-DD というファイル名になる", async () => {
  await withIsolatedStateDir(async () => {
    await markNotifiedToday(undefined, FIXED_NOW);
    const files = readdirSync(process.env.NOTIFICATION_STATE_DIR!);
    assert.deepEqual(files, ["line-notified-2026-08-21"]);
  });
});

test("異なるkindは独立したマーカーとして扱われ、互いをブロックしない", async () => {
  await withIsolatedStateDir(async () => {
    assert.equal(await hasNotifiedToday("default", FIXED_NOW), false);
    assert.equal(await hasNotifiedToday("challenge-evening-result-strategy-a-standard", FIXED_NOW), false);

    await markNotifiedToday("default", FIXED_NOW);

    assert.equal(await hasNotifiedToday("default", FIXED_NOW), true);
    assert.equal(
      await hasNotifiedToday("challenge-evening-result-strategy-a-standard", FIXED_NOW),
      false,
      "defaultのマーカーは他kindに影響しない"
    );
  });
});

test("notifyOnceTodayはkindごとに1日1回だけsend()を実行する", async () => {
  await withIsolatedStateDir(async () => {
    let calls = 0;
    const send = async () => {
      calls += 1;
    };

    const first = await notifyOnceToday(send, "test-kind", FIXED_NOW);
    const second = await notifyOnceToday(send, "test-kind", FIXED_NOW);

    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(calls, 1);
  });
});

test("send()が失敗した場合はマーカーを作らず、次回リトライできる", async () => {
  await withIsolatedStateDir(async () => {
    let calls = 0;
    const failingSend = async () => {
      calls += 1;
      throw new Error("simulated failure");
    };

    await assert.rejects(() => notifyOnceToday(failingSend, "retry-kind", FIXED_NOW));
    assert.equal(await hasNotifiedToday("retry-kind", FIXED_NOW), false);

    const succeedingSend = async () => {
      calls += 1;
    };
    const result = await notifyOnceToday(succeedingSend, "retry-kind", FIXED_NOW);

    assert.equal(result, true);
    assert.equal(calls, 2);
  });
});
