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
//
// Version 1.7.0（AI資産運用50万円チャレンジ・LINE結果通知）: 従来はマーカーが「その日1本」しか
// 持てず、朝のtodays_picks通知としか紐づいていなかった。夕方のChallenge結果通知を同じ仕組みで
// 冪等化するにあたり、kind引数を追加して「日付＋通知種別」単位でマーカーを分離できるようにした。
// 既存呼び出し（引数なし＝kind="default"）はマーカーファイル名・挙動とも一切変更していないため、
// 朝のtodays_picks通知への影響はない。

function stateDir(): string {
  // テスト時のみ一時ディレクトリへ差し替え可能（本番デフォルトは従来どおりlogs/state）。
  return process.env.NOTIFICATION_STATE_DIR ?? path.join(process.cwd(), "logs/state");
}

const DEFAULT_KIND = "default";

function todayKey(now: Date): string {
  // 既存のscreening/cache.ts・verification/store.tsと同じJST日付キーの取り方に合わせる
  // （UTC境界での日付ズレ事故を防ぐため、パターンを統一する）。
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function markerPath(dateKey: string, kind: string): string {
  // kind="default"の場合は従来と完全に同じファイル名（line-notified-YYYY-MM-DD）にする。
  // 本番にすでに存在する当日分のマーカーファイル・朝の通知ロジックとの互換性を壊さないため。
  const suffix = kind === DEFAULT_KIND ? dateKey : `${kind}-${dateKey}`;
  return path.join(stateDir(), `line-notified-${suffix}`);
}

export async function hasNotifiedToday(kind: string = DEFAULT_KIND, now: Date = new Date()): Promise<boolean> {
  try {
    await fs.access(markerPath(todayKey(now), kind));
    return true;
  } catch {
    return false;
  }
}

export async function markNotifiedToday(kind: string = DEFAULT_KIND, now: Date = new Date()): Promise<void> {
  await fs.mkdir(stateDir(), { recursive: true });
  await fs.writeFile(markerPath(todayKey(now), kind), new Date().toISOString(), "utf-8");
}

// 「確認 → 送信 → マーカー作成」を同一プロセス内で直列化するためのキュー。
// verification/store.tsのenqueue()と同じ考え方だが、あちらとは責務が異なるため
// このモジュール専用に独立して持つ（通知処理のキューがverificationの書き込みを
// 待たされる/待たせる、といった不要な結合を避けるため）。
//
// kindごとに独立したキューにする（朝のtodays_picks通知の直列化と、夕方のChallenge結果通知の
// 直列化が互いを待たされないようにするため）。
const notifyQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(kind: string, task: () => Promise<T>): Promise<T> {
  const previous = notifyQueues.get(kind) ?? Promise.resolve();
  const result = previous.then(task, task);
  notifyQueues.set(
    kind,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
}

// send()を「今日（kind単位で）まだ誰も成功させていない場合に限り」実行する。
// 手動「更新する」と8:30ジョブがほぼ同時に来ても、直列化キューにより
// send()の呼び出し（＝LINE API呼び出し）は最大1回しか発生しない。
//
// 戻り値: true = 今回のこの呼び出しで実際にsend()が成功し、マーカーを新規作成した
//         false = 今日はすでに送信済み（永続マーカーが既に存在した）だったためsend()を呼ばずスキップした
// send()が例外を投げた場合はそのまま呼び出し元へ再送出する（マーカーは作成しない＝次回リトライ可能）。
export function notifyOnceToday(
  send: () => Promise<void>,
  kind: string = DEFAULT_KIND,
  now: Date = new Date()
): Promise<boolean> {
  return enqueue(kind, async () => {
    if (await hasNotifiedToday(kind, now)) return false;
    await send();
    await markNotifiedToday(kind, now);
    return true;
  });
}
