import { NextResponse } from "next/server";
import { runPaperTradingTick } from "@/app/lib/fx/paperTrading/runTick";
import { loadState, loadSkipped, loadTrades } from "@/app/lib/fx/paperTrading/store";
import { buildPaperTradingReport } from "@/app/lib/fx/paperTrading/metrics";
import { apiError } from "@/app/lib/api/response";

// 現在の状態・トレード履歴・成績レポートを返すだけの軽量エンドポイント（tickは実行しない）。
export async function GET() {
  try {
    const [state, trades, skipped] = await Promise.all([loadState(), loadTrades(), loadSkipped()]);
    const report = buildPaperTradingReport(trades, state.equity);
    return NextResponse.json({ state, trades, skipped, report });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}

// Paper Trading本体のtickを1回実行する。将来ここを定期実行（cron/LaunchAgent等）から
// 呼び出す想定（今回はエンドポイントを用意するのみで、定期実行の設定はまだ行わない）。
export async function POST() {
  try {
    const result = await runPaperTradingTick();
    const [state, trades] = await Promise.all([loadState(), loadTrades()]);
    const report = buildPaperTradingReport(trades, state.equity);
    return NextResponse.json({ result, state, report });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
