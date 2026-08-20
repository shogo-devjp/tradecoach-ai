#!/bin/bash
# 毎日16:30ごろにLaunchAgent（com.tradecoachai.eveningsettle）から呼び出される、
# 検証専用（結果確認のみ）のスクリプト。Version 1.3で追加。
#
# 重要な役割分担（朝と夕方を完全に分離する）:
# - 新しいBUY/SELL/WAIT判定は作らない（スクリーニングAPIは呼ばない）
# - TOP3は作らない
# - LINE通知は送らない
# - 朝の判定データ（score/signal/todayAction等）は上書きしない
#   → GET /api/v1/verification は settlePendingRecords() を呼ぶだけで、これは
#     day1/day3/day5/outcomeフィールドしか書き換えない（recordJudgmentは呼ばれない）ため、
#     朝に記録された判定内容そのものは構造的に上書きされない。
#
# 処理: 1) JPX営業日確認 → 2) verification settle（2回目、当日確定した日足の反映）→
#       3) 今週最後の営業日であれば週次レポート生成
#
# Version 1.3のキャッチアップ設計: 朝と同様に「当日実行済みか」「安全な時間帯か」を確認する。
# 夕方は16:00より前だと当日の日足がまだ確定していない可能性が高いため、16:00〜23:59 JSTのみ許可する。
#
# Version 1.4.1で追加: Webサーバー起動待ち（scripts/lib/wait-for-webserver.sh）。
# Mac復帰直後にcom.tradecoachai.webserverとこのジョブのRunAtLoadがほぼ同時に走り、
# サーバー起動が間に合わずcurlが失敗する事故が実際に発生したため、API呼び出しの前に必ず待機する。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/evening-settle.log"
STATE_DIR="$PROJECT_DIR/logs/state"
VERIFICATION_API_URL="http://localhost:3000/api/v1/verification"
WEEKLY_REPORT_API_URL="http://localhost:3000/api/v1/verification/weekly-report"
WEEKLY_RESPONSE_FILE="$(mktemp /tmp/tradecoach-weekly-report-XXXXXX.json)"

source "$PROJECT_DIR/scripts/lib/wait-for-webserver.sh"

mkdir -p "$LOG_DIR" "$STATE_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S %Z"
}

cleanup() {
  rm -f "$WEEKLY_RESPONSE_FILE"
}
trap cleanup EXIT

TODAY_JST="$(TZ=Asia/Tokyo date +%Y-%m-%d)"
EVENING_MARKER="$STATE_DIR/evening-done-$TODAY_JST"
CURRENT_HHMM="$(TZ=Asia/Tokyo date +%H%M)"

# 1) 休場日チェック（朝と同じロジック・同じスクリプトを共有）。
if ! node "$PROJECT_DIR/scripts/check-market-open.mjs" 2>>"$LOG_FILE"; then
  echo "[$(timestamp)] Market closed. Skip evening settle." >> "$LOG_FILE"
  exit 0
fi

# 1.5) 当日すでに夕方処理が成功済みなら、RunAtLoad等による重複起動でも何もしない。
if [ -f "$EVENING_MARKER" ]; then
  echo "[$(timestamp)] Evening settle already completed today. Skip (marker: $EVENING_MARKER)." >> "$LOG_FILE"
  exit 0
fi

# 1.6) キャッチアップ安全窓: 16:00〜23:59 JSTのみ実行を許可する。
#      それより前（16:00未満）は当日の日足がまだ確定していない可能性が高いためスキップする。
if [ "$CURRENT_HHMM" -lt "1600" ]; then
  echo "[$(timestamp)] Outside evening window (16:00-23:59 JST, now ${CURRENT_HHMM}). Skip (today's closes may not be settled yet)." >> "$LOG_FILE"
  exit 0
fi

# 1.7) 本番Webサーバー(127.0.0.1:3000)が応答可能になるまで待つ。Mac復帰直後の起動競合対策。
#      最大約60秒待っても応答がなければERRORとして終了し、当日実行済みマーカーは作らない
#      （安全窓内であれば次回のキャッチアップ起動で再試行される）。
if ! wait_for_webserver "$LOG_FILE"; then
  echo "[$(timestamp)] ERROR: Webサーバーが約60秒待っても起動しませんでした。処理を中断します。" >> "$LOG_FILE"
  exit 1
fi

# 2) verification settle（2回目）。新しい判定は作らず、TOP3も作らず、LINE通知もしない。
settle_started=$(date +%s)
settle_http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 180 "$VERIFICATION_API_URL")
settle_curl_exit=$?
settle_elapsed=$(( $(date +%s) - settle_started ))

if [ $settle_curl_exit -ne 0 ]; then
  echo "[$(timestamp)] ERROR: evening settleのcurlが失敗しました（exit code $settle_curl_exit, ${settle_elapsed}s）。next dev/next startが起動しているか確認してください。" >> "$LOG_FILE"
  exit 1
fi

if [ "$settle_http_code" != "200" ]; then
  echo "[$(timestamp)] ERROR: evening settleが失敗しました（HTTP $settle_http_code, ${settle_elapsed}s）。" >> "$LOG_FILE"
  exit 1
fi

echo "[$(timestamp)] evening settle OK (HTTP $settle_http_code, ${settle_elapsed}s)" >> "$LOG_FILE"

# 3) 今週最後の営業日であれば週次レポートを生成する（それ以外の日はスキップ）。
if node "$PROJECT_DIR/scripts/is-last-trading-day-of-week.mjs"; then
  report_http_code=$(curl -s -o "$WEEKLY_RESPONSE_FILE" -w "%{http_code}" --max-time 60 -X POST "$WEEKLY_REPORT_API_URL")
  if [ "$report_http_code" = "200" ]; then
    report_path=$(node -e '
      const fs = require("fs");
      try {
        const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
        console.log(d.path ?? "(不明)");
      } catch {
        console.log("(レスポンスの解析に失敗しました)");
      }
    ' "$WEEKLY_RESPONSE_FILE" 2>/dev/null)
    echo "[$(timestamp)] Weekly report generated: $report_path" >> "$LOG_FILE"
  else
    echo "[$(timestamp)] WARN: 週次レポート生成に失敗しました（HTTP $report_http_code）。来週の最終営業日に再試行されます。" >> "$LOG_FILE"
  fi
else
  echo "[$(timestamp)] Not the last trading day of this week. Skip weekly report." >> "$LOG_FILE"
fi

# 完了マーカー（settleが成功した時点で当日分完了とする。週次レポートの成否は上のログで別途確認可能）。
touch "$EVENING_MARKER"
exit 0
