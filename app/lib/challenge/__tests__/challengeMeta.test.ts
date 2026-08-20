import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// CHALLENGE_DATA_DIRはstore.tsが呼び出しの都度読み直すため、各testの実行前に設定すれば足りる
// （他モジュールと同じ理由。paperTrading/store.ts等参照）。
function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(path.join(tmpdir(), "challenge-meta-test-"));
  process.env.CHALLENGE_DATA_DIR = dir;
  return fn().finally(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.CHALLENGE_DATA_DIR;
  });
}

// テストケース1: 初期資金500,000円でChallenge準備状態を作れる
test("ensureChallengeInitialized()で初期資金500,000円・status:preparing・startedAt:nullのChallengeを作成できる", async () => {
  await withTempDataDir(async () => {
    const { ensureChallengeInitialized } = await import("../challengeMeta");
    const meta = await ensureChallengeInitialized();

    assert.equal(meta.initialCapital, 500_000);
    assert.equal(meta.status, "preparing");
    assert.equal(meta.startedAt, null);
    assert.equal(meta.paperTrading, true);
    assert.equal(meta.universe, "nikkei225");
  });
});

test("ensureChallengeInitialized()を2回呼んでも既存分を上書きしない", async () => {
  await withTempDataDir(async () => {
    const { ensureChallengeInitialized } = await import("../challengeMeta");
    const first = await ensureChallengeInitialized();
    const second = await ensureChallengeInitialized();
    assert.deepEqual(second, first);
  });
});

// テストケース2: 本稼働前にstartedAtを勝手に確定しない
test("activateChallenge()を呼ばない限りstartedAtはnullのまま確定しない", async () => {
  await withTempDataDir(async () => {
    const { ensureChallengeInitialized } = await import("../challengeMeta");
    const { readChallengeMeta } = await import("../store");

    await ensureChallengeInitialized();
    // 何も呼ばずに放置しても（時間経過を模して複数回読み直しても）nullのまま
    const meta1 = await readChallengeMeta();
    const meta2 = await readChallengeMeta();
    assert.equal(meta1!.startedAt, null);
    assert.equal(meta2!.startedAt, null);
    assert.equal(meta1!.status, "preparing");
  });
});

test("activateChallenge()を呼ぶと一度だけstartedAtが確定し、以後は上書きされない", async () => {
  await withTempDataDir(async () => {
    const { ensureChallengeInitialized, activateChallenge } = await import("../challengeMeta");
    await ensureChallengeInitialized();

    const activateAt = new Date("2026-09-01T08:30:00+09:00");
    const first = await activateChallenge(activateAt);
    assert.equal(first.activated, true);
    assert.equal(first.meta!.startedAt, activateAt.toISOString());
    assert.equal(first.meta!.status, "active");
  });
});

test("activateChallenge()を2回呼んでもstartedAtは最初の値のまま変わらない（冪等）", async () => {
  await withTempDataDir(async () => {
    const { ensureChallengeInitialized, activateChallenge } = await import("../challengeMeta");
    await ensureChallengeInitialized();

    const first = await activateChallenge(new Date("2026-09-01T08:30:00+09:00"));
    const second = await activateChallenge(new Date("2026-09-05T08:30:00+09:00"));

    assert.equal(second.activated, false);
    assert.equal(second.reason, "already_active");
    assert.equal(second.meta!.startedAt, first.meta!.startedAt, "2回目に渡した日時で上書きされない");
  });
});

test("activateChallenge()は未初期化の場合fail-safeで何もしない", async () => {
  await withTempDataDir(async () => {
    const { activateChallenge } = await import("../challengeMeta");
    const result = await activateChallenge();
    assert.equal(result.activated, false);
    assert.equal(result.reason, "not_initialized");
  });
});
