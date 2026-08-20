#!/bin/bash
# Paper Trading（Phase 1）夕処理。当日の日足Open/High/Low/Closeが確定した後（既存の
# evening-settle.shと同じ16:00〜23:59 JST安全窓）に起動し、POST /api/v1/paper-trading/run を
# 1回叩いて約定・EXITを確定させる。
#
# このスクリプトはビジネスロジックを一切持たない（判断・約定計算はすべてapp/lib/paperTrading/engine.ts
# 側で行う）。将来Windows専用PCへ移行する際は、このスクリプトとplistだけを差し替えれば良い。
#
# 既存の朝夕バッチ（run-morning-signal.sh / run-evening-settle.sh）・verification・
# LINE通知には一切触れない。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/paper-trading.log"
STATE_DIR="$PROJECT_DIR/logs/state"
RUN_API_URL="http://localhost:3000/api/v1/paper-trading/run"
RESPONSE_FILE="$(mktemp /tmp/tradecoach-paper-run-XXXXXX.json)"

source "$PROJECT_DIR/scripts/lib/wait-for-webserver.sh"

mkdir -p "$LOG_DIR" "$STATE_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S %Z"
}

cleanup() {
  rm -f "$RESPONSE_FILE"
}
trap cleanup EXIT

TODAY_JST="$(TZ=Asia/Tokyo date +%Y-%m-%d)"
RUN_MARKER="$STATE_DIR/paper-run-done-$TODAY_JST"
CURRENT_HHMM="$(TZ=Asia/Tokyo date +%H%M)"

if ! node "$PROJECT_DIR/scripts/check-market-open.mjs" 2>>"$LOG_FILE"; then
  echo "[$(timestamp)] Market closed. Skip paper trading run." >> "$LOG_FILE"
  exit 0
fi

if [ -f "$RUN_MARKER" ]; then
  echo "[$(timestamp)] Paper trading run already completed today. Skip (marker: $RUN_MARKER)." >> "$LOG_FILE"
  exit 0
fi

# 既存evening-settle.shと同じ安全窓（16:00未満は当日の日足がまだ確定していない可能性が高い）。
if [ "$CURRENT_HHMM" -lt "1600" ]; then
  echo "[$(timestamp)] Outside evening window (16:00-23:59 JST, now ${CURRENT_HHMM}). Skip (today's closes may not be settled yet)." >> "$LOG_FILE"
  exit 0
fi

if ! wait_for_webserver "$LOG_FILE"; then
  echo "[$(timestamp)] ERROR: Webサーバーが約60秒待っても起動しませんでした。処理を中断します。" >> "$LOG_FILE"
  exit 1
fi

http_code=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" --max-time 180 -X POST "$RUN_API_URL")
curl_exit=$?

if [ $curl_exit -ne 0 ]; then
  echo "[$(timestamp)] ERROR: run APIのcurlが失敗しました（exit code $curl_exit）。" >> "$LOG_FILE"
  exit 1
fi

if [ "$http_code" = "200" ]; then
  summary=$(node -e '
    const fs = require("fs");
    try {
      const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
      const s = d.portfolioSnapshot;
      console.log(`skipped=${d.skipped} exited=${(d.exitedPositionIds||[]).length} opened=${(d.newlyOpenedPositionIds||[]).length} rejected=${(d.rejectedEntries||[]).length} totalAssets=${s?s.totalAssets:"-"} cash=${s?s.cash:"-"}`);
    } catch { console.log("(レスポンス解析失敗)"); }
  ' "$RESPONSE_FILE" 2>/dev/null)
  echo "[$(timestamp)] SUCCESS (HTTP $http_code): $summary" >> "$LOG_FILE"
  touch "$RUN_MARKER"
  exit 0
fi

body=$(head -c 500 "$RESPONSE_FILE" 2>/dev/null)
echo "[$(timestamp)] ERROR (HTTP $http_code): $body" >> "$LOG_FILE"
exit 1
