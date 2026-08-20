#!/bin/bash
# 毎朝8:30にLaunchAgent（com.tradecoachai.morningsignal）から呼び出され、
# 1) JPX営業日確認 → 2) verificationの決済（settle） → 3) 日経225スクリーニング →
# 4) LINE TOP3通知 の順で実行するスクリプト。
# 休場日（土日・年末年始・祝日）は1)の時点で全処理をスキップする（Version 1.2でも変更なし）。
# next dev（またはnext start）がlocalhost:3000で起動している必要がある。
#
# Version 1.3で追加: RunAtLoad（Mac起動・スリープ復帰時の自動キャッチアップ）に対応するため、
# 「当日実行済みか」と「安全な時間帯か」の2つのガードを追加した。
# 特に、夜にMacを起動した場合に朝のTOP3 LINE通知を遅れて送らないよう、
# 08:30〜13:00 JSTの範囲外では実行しない（詳細は下のコメント参照）。
#
# Version 1.4.1で追加:
# - Webサーバー起動待ち（scripts/lib/wait-for-webserver.sh）。Mac復帰直後にcom.tradecoachai.webserverと
#   このジョブのRunAtLoadがほぼ同時に走ると、サーバー起動が間に合わずcurlが失敗する事故が
#   実際に発生したため、API呼び出しの前に必ず待機する。
# - スクリーニングAPIを?force=trueで呼ぶ。8:30より前にダッシュボードの「更新する」で
#   当日分がスキャン済みでも、8:30には必ず新規スキャンを行い、recordJudgment()の
#   既存アップサート仕様（同日・同銘柄は上書き）でverificationデータを8:30時点の内容に置き換える。
#   LINE通知は既存のalreadyNotifiedToday引き継ぎロジックにより1日1回のまま変わらない。
# - レスポンスのfreshScan===trueを確認できた場合のみmorning-doneマーカーを作成する
#   （単なるキャッシュ返却をマーカー作成のトリガーにしない）。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/morning-signal.log"
STATE_DIR="$PROJECT_DIR/logs/state"
VERIFICATION_API_URL="http://localhost:3000/api/v1/verification"
SCREENING_API_URL="http://localhost:3000/api/v1/screening/signals?force=true"
RESPONSE_FILE="$(mktemp /tmp/tradecoach-morning-signal-XXXXXX.json)"

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
MORNING_MARKER="$STATE_DIR/morning-done-$TODAY_JST"
CURRENT_HHMM="$(TZ=Asia/Tokyo date +%H%M)"

# 1) 日本株市場（JPX）が休場日（土日・年末年始・祝日）なら、verification決済・スクリーニング・
#    LINE通知・APIへのアクセス自体を一切行わずに終了する（check-market-open.jsの終了コードで判定）。
if ! node "$PROJECT_DIR/scripts/check-market-open.mjs" 2>>"$LOG_FILE"; then
  echo "[$(timestamp)] Market closed. Skip morning signal (verification/screening/LINE notify all skipped)." >> "$LOG_FILE"
  exit 0
fi

# 1.5) 当日すでに朝処理（TOP3 LINE通知を含む）が成功済みなら、RunAtLoad等による
#      重複起動でも何もしない（LINE通知の重複防止は既存のnotifiedフラグにも別途あるが、
#      settle・スクリーニングAPI自体への無駄な再アクセスも避けるため、ここでも止める）。
if [ -f "$MORNING_MARKER" ]; then
  echo "[$(timestamp)] Morning signal already completed today. Skip (marker: $MORNING_MARKER)." >> "$LOG_FILE"
  exit 0
fi

# 1.6) キャッチアップ安全窓: 08:30〜13:00 JSTの間のみ実行を許可する。
#      これより後（例: 夜にMacを起動した場合）に、鮮度を失ったTOP3 LINE通知を
#      遅れて送信してしまう事故を防ぐのが目的。この時間帯外はスキップし、
#      当日の朝処理は「未実行のまま」にする（マーカーを作らない＝翌日には影響しない）。
if [ "$CURRENT_HHMM" -lt "0830" ] || [ "$CURRENT_HHMM" -gt "1300" ]; then
  echo "[$(timestamp)] Outside morning catch-up window (08:30-13:00 JST, now ${CURRENT_HHMM}). Skip to avoid sending a stale TOP3 notification." >> "$LOG_FILE"
  exit 0
fi

# 1.7) 本番Webサーバー(127.0.0.1:3000)が応答可能になるまで待つ。Mac復帰直後の起動競合対策。
#      最大約60秒待っても応答がなければERRORとして終了し、当日実行済みマーカーは作らない
#      （安全窓内であれば次回のキャッチアップ起動で再試行される）。
if ! wait_for_webserver "$LOG_FILE"; then
  echo "[$(timestamp)] ERROR: Webサーバーが約60秒待っても起動しませんでした。処理を中断します。" >> "$LOG_FILE"
  exit 1
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
      console.log(`buySignals=${d.buySignals?.length ?? 0} sellSignals=${d.sellSignals?.length ?? 0} scannedCount=${d.scannedCount ?? "-"} failedCount=${d.failedCount ?? "-"} freshScan=${d.freshScan ?? "-"}`);
    } catch {
      console.log("(レスポンスの解析に失敗しました)");
    }
  ' "$RESPONSE_FILE" 2>/dev/null)
  echo "[$(timestamp)] SUCCESS (HTTP $http_code): $summary" >> "$LOG_FILE"

  fresh_scan=$(node -e '
    const fs = require("fs");
    try {
      const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
      console.log(d.freshScan === true ? "true" : "false");
    } catch {
      console.log("false");
    }
  ' "$RESPONSE_FILE" 2>/dev/null)

  # Version 1.4.1: 単なるキャッシュ返却（freshScan:false）はdone扱いにしない。
  # ?force=trueを付けている以上freshScan:falseになるのは想定外だが、念のため区別する。
  if [ "$fresh_scan" = "true" ]; then
    touch "$MORNING_MARKER"
  else
    echo "[$(timestamp)] WARN: freshScanがfalseのため、当日実行済みマーカーは作成しません（想定外の状態です）。" >> "$LOG_FILE"
  fi
  exit 0
fi

body=$(head -c 500 "$RESPONSE_FILE" 2>/dev/null)
echo "[$(timestamp)] ERROR (HTTP $http_code): $body" >> "$LOG_FILE"
exit 1
