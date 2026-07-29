import type { ScreenedStock } from "@/app/lib/screening/types";
import type { NotificationEvent, WatchlistSignalChange } from "./types";
import { DISCLAIMER_TEXT_SHORT, simplifyReason } from "@/app/lib/technicalAnalysis/displayLabels";

const DIVIDER = "━━━━━━━━━━━━";

// watchlist_signal_change用。LINE Messaging APIの1回の送信上限（5件）に合わせて絞る。
const MAX_WATCHLIST_MESSAGES_PER_CALL = 5;

const MEDALS = ["🥇", "🥈", "🥉"];
// 銘柄ごとに見せる根拠は2つまで（「今日見るべき銘柄だけを教える」思想を保つため詳細は載せない）
const MAX_REASONS_PER_STOCK = 2;

// LINEは「アプリを開くきっかけ」に徹し、移動平均線・MACD・RSI等の専門用語は出さない。
// 詳しい判断根拠はアプリの詳細分析画面（ReasonsList）で確認する設計。
function buildStockLines(stock: ScreenedStock, medal: string): string[] {
  const reasonLines = stock.reasons
    .slice(0, MAX_REASONS_PER_STOCK)
    .map((reason) => `・${simplifyReason(reason)}`);
  return [`${medal} ${stock.name}`, `AI評価：${stock.score}点`, ...reasonLines, ""];
}

// TradeCoach AIは「全部の銘柄を知らせる」のではなく「今日見るべき銘柄だけを教える」方針のため、
// 1日1通・買い候補上位3件（無ければ0〜2件）だけを「今日のAIコーチ」として1つのメッセージにまとめる。
// 候補が0件の日は「今日は休みましょう」と伝える（30秒以内で読める分量を維持）。
function buildTodaysPicksMessage(candidates: ScreenedStock[]): string {
  if (candidates.length === 0) {
    return [
      "📈 TradeCoach AI",
      "",
      "【今日のAIコーチ】",
      "",
      "🔴 今日の結論",
      "",
      "今日は条件を満たす銘柄はありません。",
      "",
      "今日は休みましょう。",
      "",
      DISCLAIMER_TEXT_SHORT,
    ].join("\n");
  }

  const stockLines = candidates.flatMap((stock, index) => buildStockLines(stock, MEDALS[index]));

  return [
    "📈 TradeCoach AI",
    "",
    "【今日のAIコーチ】",
    "",
    "🟢 今日の結論",
    `今日は買い候補が${candidates.length}銘柄あります。`,
    "",
    ...stockLines,
    `今日はこの${candidates.length}銘柄だけ見ればOKです。`,
    "",
    DISCLAIMER_TEXT_SHORT,
  ].join("\n");
}

function buildWatchlistChangeMessage(change: WatchlistSignalChange): string {
  return [
    DIVIDER,
    "TradeCoach AI",
    "",
    "ウォッチリスト銘柄のシグナル変化",
    "",
    `${change.name}（${change.code}）`,
    "",
    "シグナル",
    `${change.previousSignal} → ${change.currentSignal}`,
    "",
    "総合評価",
    `${change.previousScore}点 → ${change.currentScore}点`,
    DISCLAIMER_TEXT_SHORT,
    DIVIDER,
  ].join("\n");
}

// 通知イベントから送信用テキストメッセージの配列を組み立てる。
// LINEのAPI呼び出し（lineClient）からは完全に独立した純粋関数で、
// consoleNotifier・lineNotifier・将来のDiscord/Slack向けNotifierが共通で使う。
export function buildNotificationMessages(event: NotificationEvent): string[] {
  if (event.type === "watchlist_signal_change") {
    return event.changes.slice(0, MAX_WATCHLIST_MESSAGES_PER_CALL).map(buildWatchlistChangeMessage);
  }

  // todays_picksは常に1通のみ（候補が複数あってもメッセージ配列は長さ1に固定）
  return [buildTodaysPicksMessage(event.candidates)];
}
