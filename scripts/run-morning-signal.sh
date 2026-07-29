#!/bin/bash
# 毎朝8:30にLaunchAgent（com.tradecoachai.morningsignal）から呼び出され、
# 日経225スクリーニング＋LINE通知（買い/売りシグナル）をトリガーするスクリプト。
# next dev（またはnext start）がlocalhost:3000で起動している必要がある。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/morning-signal.log"
API_URL="http://localhost:3000/api/v1/screening/signals"
RESPONSE_FILE="$(mktemp /tmp/tradecoach-morning-signal-XXXXXX.json)"

mkdir -p "$LOG_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S %Z"
}

cleanup() {
  rm -f "$RESPONSE_FILE"
}
trap cleanup EXIT

http_code=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" --max-time 120 -X POST "$API_URL")
curl_exit=$?

if [ $curl_exit -ne 0 ]; then
  echo "[$(timestamp)] ERROR: curlが失敗しました（exit code $curl_exit）。next dev/next startが起動しているか確認してください。" >> "$LOG_FILE"
  exit 1
fi

if [ "$http_code" = "200" ]; then
  summary=$(node -e '
    const fs = require("fs");
    try {
      const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
      console.log(`buySignals=${d.buySignals?.length ?? 0} sellSignals=${d.sellSignals?.length ?? 0} scannedCount=${d.scannedCount ?? "-"} failedCount=${d.failedCount ?? "-"}`);
    } catch {
      console.log("(レスポンスの解析に失敗しました)");
    }
  ' "$RESPONSE_FILE" 2>/dev/null)
  echo "[$(timestamp)] SUCCESS (HTTP $http_code): $summary" >> "$LOG_FILE"
  exit 0
fi

body=$(head -c 500 "$RESPONSE_FILE" 2>/dev/null)
echo "[$(timestamp)] ERROR (HTTP $http_code): $body" >> "$LOG_FILE"
exit 1
