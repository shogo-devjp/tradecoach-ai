import { promises as fs } from "node:fs";
import path from "node:path";

// Version 1.4.1: LINE「本日送信済み」状態の永続化。
//
// 背景: 従来はapp/lib/screening/cache.tsのメモリ上notifiedフラグだけで1日1回を制御していたが、
// Webサーバーの再起動（KeepAliveによる自動復旧・restart-webserver.shでの再デプロイ・
// Mac再起動後の再起動など）でこのフラグが消えてしまい、実際に重複送信事故が発生した。
// このモジュールはディスク上のマーカーファイルを正（source of truth）として、
// プロセスが再起動してもその日の送信済み状態を失わない設計にする。
//
// 責務分離: app/lib/verification/store.tsのenqueue()（verificationログの書き込み直列化）とは
// 完全に別の直列化キューをこのモジュール内に持つ。通知の直列化はここだけで完結させる。

const STATE_DIR = path.join(process.cwd(), "logs/state");

function todayKey(): string {
  // 既存のscreening/cache.ts・verification/store.tsと同じJST日付キーの取り方に合わせる
  // （UTC境界での日付ズレ事故を防ぐため、パターンを統一する）。
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function markerPath(dateKey: string): string {
  return path.join(STATE_DIR, `line-notified-${dateKey}`);
}

export async function hasNotifiedToday(): Promise<boolean> {
  try {
    await fs.access(markerPath(todayKey()));
    return true;
  } catch {
    return false;
  }
}

export async function markNotifiedToday(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(markerPath(todayKey()), new Date().toISOString(), "utf-8");
}

// 「確認 → 送信 → マーカー作成」を同一プロセス内で直列化するためのキュー。
// verification/store.tsのenqueue()と同じ考え方だが、あちらとは責務が異なるため
// このモジュール専用に独立して持つ（通知処理のキューがverificationの書き込みを
// 待たされる/待たせる、といった不要な結合を避けるため）。
let notifyQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = notifyQueue.then(task, task);
  notifyQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

// send()を「今日まだ誰も成功させていない場合に限り」実行する。
// 手動「更新する」と8:30ジョブがほぼ同時に来ても、直列化キューにより
// send()の呼び出し（＝LINE API呼び出し）は最大1回しか発生しない。
//
// 戻り値: true = 今回のこの呼び出しで実際にsend()が成功し、マーカーを新規作成した
//         false = 今日はすでに送信済み（永続マーカーが既に存在した）だったためsend()を呼ばずスキップした
// send()が例外を投げた場合はそのまま呼び出し元へ再送出する（マーカーは作成しない＝次回リトライ可能）。
export function notifyOnceToday(send: () => Promise<void>): Promise<boolean> {
  return enqueue(async () => {
    if (await hasNotifiedToday()) return false;
    await send();
    await markNotifiedToday();
    return true;
  });
}
