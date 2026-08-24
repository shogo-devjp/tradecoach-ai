import type { ScreenedStock } from "@/app/lib/screening/types";
import type { NotificationEvent, WatchlistSignalChange } from "./types";
import type { ChallengeDailyRecord, ChallengeDailyTradeEntry } from "@/app/lib/challenge/types";
import { DISCLAIMER_TEXT_SHORT, simplifyReason } from "@/app/lib/technicalAnalysis/displayLabels";

const DIVIDER = "━━━━━━━━━━━━";

// watchlist_signal_change用。LINE Messaging APIの1回の送信上限（5件）に合わせて絞る。
const MAX_WATCHLIST_MESSAGES_PER_CALL = 5;

// challenge_daily_result用。利確／損切りの銘柄名内訳は最大3件＋「ほか○件」に絞り、
// LINEメッセージが長くなりすぎないようにする（ユーザー要望）。
const MAX_EXIT_HIGHLIGHTS_PER_SIDE = 3;

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

// ±符号付きの円表示（0以上は "+" を付ける）。
function formatSignedYen(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return `${sign}${Math.round(amount).toLocaleString("ja-JP")}円`;
}

// ±符号付きのパーセント表示（小数第2位まで）。
function formatSignedPercent(percent: number): string {
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

// ±符号付きのポイント表示（対ベンチマークの超過リターン用）。
function formatSignedPoints(points: number): string {
  const sign = points >= 0 ? "+" : "";
  return `${sign}${points.toFixed(2)}pt`;
}

// realizedPnl（実現損益）の符号でEXITを「利確」「損切り」に分類する。
// exitReason（stop_loss/take_profit/sell_signal/max_holding_period）ではなく実現損益の符号で
// 分けているのは、sell_signal・max_holding_period終了の建玉もどちらかには必ず分類され、
// 通知から漏れる建玉が出ないようにするため（ユーザー提示の「利確」「損切り」はこの二分類の意味で使う）。
function classifyExit(trade: ChallengeDailyTradeEntry): "profit" | "loss" | null {
  if (trade.side !== "EXIT" || trade.realizedPnl === null) return null;
  return trade.realizedPnl >= 0 ? "profit" : "loss";
}

function buildExitHighlightLines(trades: ChallengeDailyTradeEntry[], kind: "profit" | "loss"): string[] {
  const matched = trades.filter((t) => classifyExit(t) === kind);
  if (matched.length === 0) return [];

  const header = kind === "profit" ? "📈 利確" : "📉 損切り";
  const lines: string[] = [header];
  matched.slice(0, MAX_EXIT_HIGHLIGHTS_PER_SIDE).forEach((trade) => {
    lines.push(`${trade.code} ${trade.companyName}`);
    lines.push(`実現損益：${formatSignedYen(trade.realizedPnl ?? 0)}`);
  });
  const remaining = matched.length - MAX_EXIT_HIGHLIGHTS_PER_SIDE;
  if (remaining > 0) lines.push(`ほか${remaining}件`);
  lines.push("");
  return lines;
}

// 毎営業日16:35以降のchallenge evening orchestration正常終了後に送る、その日1通の運用結果通知。
// 数値はすべてChallengeDailyRecord（Paper Trading本体の確定値をそのまま転記したもの）から
// そのまま読み取るだけで、ここでは一切再計算しない（このモジュールのSSOTはChallengeDailyRecord）。
function buildChallengeDailyResultMessage(record: ChallengeDailyRecord): string {
  const profitLines = buildExitHighlightLines(record.trades, "profit");
  const lossLines = buildExitHighlightLines(record.trades, "loss");

  return [
    `📊 TradeCoach AI｜Day ${record.tradingDayNumber} 運用結果`,
    "",
    `総資産：${Math.round(record.totalAssets).toLocaleString("ja-JP")}円`,
    `本日損益：${formatSignedYen(record.dailyPnl)}`,
    `累計損益：${formatSignedYen(record.cumulativePnl)}（${formatSignedPercent(record.cumulativeReturnPercent)}）`,
    `日経225：${formatSignedPercent(record.benchmarkCumulativeReturnPercent)}`,
    `日経225との差：${formatSignedPoints(record.excessReturnPercentagePoints)}`,
    "",
    `🆕 新規ENTRY：${record.entryCount}件`,
    `📈 利確：${record.trades.filter((t) => classifyExit(t) === "profit").length}件`,
    `📉 損切り：${record.trades.filter((t) => classifyExit(t) === "loss").length}件`,
    `📦 現在保有：${record.openPositionCount}銘柄`,
    "",
    ...profitLines,
    ...lossLines,
    "本日の処理：正常完了 ✅",
    "※Paper Trading（仮想運用）",
  ].join("\n");
}

// 夕方オーケストレーション自体が失敗した日の簡潔な警告通知。
// 正常結果通知（challenge_daily_result）とは排他（同日に両方送られることはない。
// app/lib/challenge/dailyResultNotifier.ts側でどちらか一方のみ呼び出す）。
function buildChallengeEveningErrorMessage(event: Extract<NotificationEvent, { type: "challenge_evening_error" }>): string {
  return [
    "⚠️ TradeCoach AI｜夕方処理エラー",
    "",
    event.date,
    "夕方の自動処理が正常完了しませんでした。",
    "",
    `失敗Step：${event.failedStep ?? "不明"}`,
    "詳細確認が必要です。",
    "",
    "※Paper Trading",
  ].join("\n");
}

// 通知イベントから送信用テキストメッセージの配列を組み立てる。
// LINEのAPI呼び出し（lineClient）からは完全に独立した純粋関数で、
// consoleNotifier・lineNotifier・将来のDiscord/Slack向けNotifierが共通で使う。
export function buildNotificationMessages(event: NotificationEvent): string[] {
  if (event.type === "watchlist_signal_change") {
    return event.changes.slice(0, MAX_WATCHLIST_MESSAGES_PER_CALL).map(buildWatchlistChangeMessage);
  }

  if (event.type === "challenge_daily_result") {
    return [buildChallengeDailyResultMessage(event.record)];
  }

  if (event.type === "challenge_evening_error") {
    return [buildChallengeEveningErrorMessage(event)];
  }

  // todays_picksは常に1通のみ（候補が複数あってもメッセージ配列は長さ1に固定）
  return [buildTodaysPicksMessage(event.candidates)];
}
