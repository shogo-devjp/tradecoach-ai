import { NextResponse } from "next/server";
import { getCachedScan, setCachedScan, markScanNotified } from "@/app/lib/screening/cache";
import { scanUniverse } from "@/app/lib/screening/scanUniverse";
import { rankBuySignals, rankSellSignals } from "@/app/lib/screening/rankings";
import { STOCK_UNIVERSES } from "@/app/lib/screening/universes";
import { dispatchNotifications } from "@/app/lib/notifications/dispatchNotifications";
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

    if (!cached) {
      const { candidates, failedCount } = await scanUniverse(STOCK_UNIVERSES.nikkei225);
      cached = setCachedScan(candidates, STOCK_UNIVERSES.nikkei225.length, failedCount);
      // 再スキャン前にすでに通知済みだった場合、新しいキャッシュにもその状態を引き継ぐ
      if (alreadyNotifiedToday) markScanNotified();
    }

    // 通知は「スキャン結果」ではなく「その日にまだ送っていないか」で制御する。
    // force=trueで同日中に何度スキャンし直しても、通知は1日1通に保つ。
    // 通知の送信失敗（LINE側の認証エラー等）でスキャン結果そのものが失われないよう、
    // 通知はスキャン本体とは別に隔離してエラーを握りつぶす（ログにだけ残す）。
    if (!cached.notified) {
      const topPicks = rankBuySignals(cached.candidates, DEFAULT_THRESHOLD, TODAYS_PICKS_LIMIT);
      await dispatchNotifications({ type: "todays_picks", candidates: topPicks })
        .then(() => markScanNotified())
        .catch((error) => console.error("[notifications] todays_picks の配信に失敗しました:", error));
    }

    return NextResponse.json(buildResponse(cached, minScore));
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
