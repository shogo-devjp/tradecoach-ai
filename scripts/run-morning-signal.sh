#!/bin/bash
# 毎朝8:30にLaunchAgent（com.tradecoachai.morningsignal）から呼び出され、
# 1) JPX営業日確認 → 2) verificationの決済（settle） → 3) 日経225スクリーニング →
# 4) LINE TOP3通知 の順で実行するスクリプト。
# 休場日（土日・年末年始・祝日）は1)の時点で全処理をスキップする（Version 1.2でも変更なし）。
# next dev（またはnext start）がlocalhost:3000で起動している必要がある。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/morning-signal.log"
VERIFICATION_API_URL="http://localhost:3000/api/v1/verification"
SCREENING_API_URL="http://localhost:3000/api/v1/screening/signals"
RESPONSE_FILE="$(mktemp /tmp/tradecoach-morning-signal-XXXXXX.json)"

mkdir -p "$LOG_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S %Z"
}

cleanup() {
  rm -f "$RESPONSE_FILE"
}
trap cleanup EXIT

# 1) 日本株市場（JPX）が休場日（土日・年末年始・祝日）なら、verification決済・スクリーニング・
#    LINE通知・APIへのアクセス自体を一切行わずに終了する（check-market-open.jsの終了コードで判定）。
if ! node "$PROJECT_DIR/scripts/check-market-open.mjs" 2>>"$LOG_FILE"; then
  echo "[$(timestamp)] Market closed. Skip morning signal (verification/screening/LINE notify all skipped)." >> "$LOG_FILE"
  exit 0
fi

# 2) verificationのsettle（day1/day3/day5の実測反映）。
#    ログが増えるほど処理時間が伸びるため余裕を持ってmax-time 180秒とする。
#    settleが失敗してもその日のスクリーニング・LINE通知は止めない（ベストエフォート、失敗はログにのみ残す）。
verify_started=$(date +%s)
verify_http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 180 "$VERIFICATION_API_URL")
verify_curl_exit=$?
verify_elapsed=$(( $(date +%s) - verify_started ))

if [ $verify_curl_exit -ne 0 ]; then
  echo "[$(timestamp)] WARN: verification settleのcurlが失敗しました（exit code $verify_curl_exit, ${verify_elapsed}s）。スクリーニングは続行します。" >> "$LOG_FILE"
elif [ "$verify_http_code" = "200" ]; then
  echo "[$(timestamp)] verification settle OK (HTTP $verify_http_code, ${verify_elapsed}s)" >> "$LOG_FILE"
else
  echo "[$(timestamp)] WARN: verification settleが失敗しました（HTTP $verify_http_code, ${verify_elapsed}s）。スクリーニングは続行します。" >> "$LOG_FILE"
fi

# 3) 当日のスクリーニング（買い/売りシグナル判定）＋ 4) LINE TOP3通知（スクリーニングAPI内部で実行）。
http_code=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" --max-time 120 -X POST "$SCREENING_API_URL")
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
