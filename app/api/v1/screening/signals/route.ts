import { NextResponse } from "next/server";
import { getCachedScan, setCachedScan, markScanNotified } from "@/app/lib/screening/cache";
import { scanUniverse } from "@/app/lib/screening/scanUniverse";
import { rankBuySignals, rankSellSignals } from "@/app/lib/screening/rankings";
import { STOCK_UNIVERSES } from "@/app/lib/screening/universes";
import { dispatchNotifications } from "@/app/lib/notifications/dispatchNotifications";
import { notifyOnceToday } from "@/app/lib/notifications/dailyNotifiedStore";
import { apiError } from "@/app/lib/api/response";
import type { ScreenedStock } from "@/app/lib/screening/types";

const VALID_THRESHOLDS = [70, 80, 90] as const;
const DEFAULT_THRESHOLD = 80;

// LINE通知「今日の注目銘柄」に載せる最大件数。ダッシュボード表示（買いランキング等）とは
// 別の関心事のため、この定数はここでのみ使う。
const TODAYS_PICKS_LIMIT = 3;

function parseMinScore(value: string | null): number {
  const parsed = Number(value);
  return (VALID_THRESHOLDS as readonly number[]).includes(parsed) ? parsed : DEFAULT_THRESHOLD;
}

function buildResponse(
  cached: { scannedAt: string; scannedCount: number; failedCount: number; candidates: ScreenedStock[] },
  minScore: number
) {
  return {
    hasRunToday: true,
    scannedAt: cached.scannedAt,
    scannedCount: cached.scannedCount,
    failedCount: cached.failedCount,
    buySignals: rankBuySignals(cached.candidates, minScore),
    sellSignals: rankSellSignals(cached.candidates),
  };
}

// ページ表示・閾値変更用の軽量エンドポイント。スキャンは実行せず当日キャッシュを返すだけ。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minScore = parseMinScore(searchParams.get("minScore"));

  const cached = getCachedScan();
  if (!cached) {
    return NextResponse.json({ hasRunToday: false, buySignals: [], sellSignals: [] });
  }

  return NextResponse.json(buildResponse(cached, minScore));
}

// 「更新する」ボタン・毎朝8:30のLaunchAgentから呼ばれる実処理。
// 当日すでにスキャン済みならキャッシュを返すだけにし、日経225スターターセット相当のスキャンが
// 複数クライアントから重複実行されないようにする。?force=true を付けた場合のみ強制的に再スキャンする。
// Version 1.4.1: 朝8:30のLaunchAgentは常にforce=trueで呼び出す。これにより、8:30より前に
// ダッシュボードの「更新する」で当日分がスキャン済みでも、8:30には必ず新規スキャンが走り、
// recordJudgment()の既存アップサート仕様（同日・同銘柄は上書き）でその日のverificationデータが
// 8:30時点の内容に置き換わる。一方でLINE通知はalreadyNotifiedTodayの引き継ぎにより
// 1日1回のまま変わらない（このロジック自体は元から存在していた）。
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const minScore = parseMinScore(searchParams.get("minScore"));
  const force = searchParams.get("force") === "true";

  try {
    // force=trueで再スキャンするとsetCachedScanが notified:false の新しいキャッシュを作り直すため、
    // 「今日すでに通知済みか」は force で捨てられる前の状態から先に読み取っておく。
    const existingCache = getCachedScan();
    const alreadyNotifiedToday = existingCache?.notified ?? false;

    let cached = force ? null : existingCache;

    // Version 1.4.1: 実際にscanUniverse()が実行された（＝新規スキャンが起きた）場合のみtrueにする。
    // 呼び出し元（run-morning-signal.sh）が「キャッシュを返しただけ」と「本当に新規スキャンできた」を
    // 区別できるようにするためのフラグ。判定ロジック・スコア計算には一切影響しない。
    let freshScan = false;

    if (!cached) {
      const { candidates, failedCount } = await scanUniverse(STOCK_UNIVERSES.nikkei225);
      cached = setCachedScan(candidates, STOCK_UNIVERSES.nikkei225.length, failedCount);
      freshScan = true;
      // 再スキャン前にすでに通知済みだった場合、新しいキャッシュにもその状態を引き継ぐ
      if (alreadyNotifiedToday) markScanNotified();
    }

    // 通知は「スキャン結果」ではなく「その日にまだ送っていないか」で制御する。
    // force=trueで同日中に何度スキャンし直しても、通知は1日1通に保つ。
    // 通知の送信失敗（LINE側の認証エラー等）でスキャン結果そのものが失われないよう、
    // 通知はスキャン本体とは別に隔離してエラーを握りつぶす（ログにだけ残す）。
    //
    // Version 1.4.1: cached.notified（メモリ）はあくまで補助。正はnotifyOnceToday()が参照する
    // logs/state/line-notified-YYYY-MM-DD（永続マーカー）で、Webサーバーの再起動（KeepAliveでの
    // 自動復旧・restart-webserver.shでの再デプロイ・Mac再起動後の再起動）をまたいでも当日の
    // 送信済み状態を失わない。また、notifyOnceToday()自体が同一プロセス内で直列化されているため、
    // 手動「更新する」と8:30ジョブがほぼ同時に来ても、LINE API呼び出しは最大1回に保たれる。
    if (!cached.notified) {
      const topPicks = rankBuySignals(cached.candidates, DEFAULT_THRESHOLD, TODAYS_PICKS_LIMIT);
      try {
        // send()が実際に呼ばれてLINE送信が成功した場合のみ永続マーカーが作られる。
        // 戻り値がfalseの場合（今日は既に送信済み）でも、メモリ側のnotifiedはtrueに同期する。
        await notifyOnceToday(() => dispatchNotifications({ type: "todays_picks", candidates: topPicks }));
        markScanNotified();
      } catch (error) {
        // 送信失敗時はmarkScanNotified()を呼ばない（メモリ・永続マーカーとも未送信のままにし、
        // 次回のリクエストで再試行できるようにする）。
        console.error("[notifications] todays_picks の配信に失敗しました:", error);
      }
    }

    return NextResponse.json({ ...buildResponse(cached, minScore), freshScan });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
