import { NextResponse } from "next/server";
import { notifyChallengeDailyResult } from "@/app/lib/challenge/dailyResultNotifier";
import { apiError } from "@/app/lib/api/response";

// 「運用処理」（POST /api/v1/challenge/evening-orchestrate）とは完全に別のエンドポイント。
// このAPIはEveningOrchestrationRecord・ChallengeDailyRecordを読むだけで、Paper Trading・
// Universe Verification・Challenge本体データへは一切書き込まない。
//
// 呼び出しタイミング（想定）: run-challenge-evening-orchestration.sh が
// evening-orchestrate の実行を試みた（＝非営業日等でスキップしなかった）後に、成否を問わず
// このAPIを1回叩く。成否の判定・エラー通知の要否はこのAPI自身がEveningOrchestrationRecordを
// 読んで内部で決める（正常終了なら結果通知、失敗なら簡潔なエラー通知、非営業日等は何もしない）。
//
// 冪等：同一日に複数回呼んでも、同じ通知種別（結果／エラー）は1日1回しか実際には送信されない
// （notifyOnceToday()のkindキーによる永続マーカーで保証）。
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") ?? undefined;
    const result = await notifyChallengeDailyResult({ date });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
