#!/bin/bash
# 夕方統合オーケストレーション（AI資産運用50万円チャレンジ・YouTube記録基盤）。
# 既存evening-settle.sh/run-paper-trading.shと同じ16:00〜23:59 JST安全窓で起動し、
# POST /api/v1/challenge/evening-orchestrate を1回叩く。
#
# このAPIは①Paper Trading run → ②Universe Verification settle → ③Challenge Daily Record生成 →
# ④Milestone判定 を「前段が正常完了した場合のみ次段へ進む」順で内部的に直列実行する
# （app/lib/challenge/eveningOrchestration.ts参照）。スクリプト自体はビジネスロジックを持たない。
#
# 重要：このスクリプトはまだいかなるLaunchAgentにも登録していない（本稼働前の準備のみ）。
# 既存のrun-paper-trading.sh・run-evening-settle.shはそのまま残しており、本スクリプトを
# 使うかどうか（従来どおり個別スクリプトを使うか、本スクリプトへ一本化するか）は
# 本稼働開始判断時にあらためて決定する。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/challenge-evening-orchestration.log"
STATE_DIR="$PROJECT_DIR/logs/state"
API_URL="http://localhost:3000/api/v1/challenge/evening-orchestrate"
RESPONSE_FILE="$(mktemp /tmp/tradecoach-challenge-evening-XXXXXX.json)"

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
DONE_MARKER="$STATE_DIR/challenge-evening-done-$TODAY_JST"
CURRENT_HHMM="$(TZ=Asia/Tokyo date +%H%M)"

if ! node "$PROJECT_DIR/scripts/check-market-open.mjs" 2>>"$LOG_FILE"; then
  echo "[$(timestamp)] Market closed. Skip challenge evening orchestration." >> "$LOG_FILE"
  exit 0
fi

# 完了マーカーはsuccessStepが"milestones"（全段成功）まで到達した場合のみ作る。
# 途中で失敗した場合はマーカーを作らず、次回のキャッチアップ起動で再試行する
# （APIは各段が冪等なため、再実行しても二重取引・二重記録は発生しない）。
if [ -f "$DONE_MARKER" ]; then
  echo "[$(timestamp)] Challenge evening orchestration already completed today. Skip (marker: $DONE_MARKER)." >> "$LOG_FILE"
  exit 0
fi

# 本稼働前の最終安全監査でAPI側にも同じ16:35 JST締切のガードを追加した（二重防御）ため、
# スクリプト側の安全窓もそれに合わせて16:35に統一する（API単体を誤って早く呼んでも
# skipReason:"before_settle_window"で安全に何もしないが、スクリプト側でも早期リターンして
# 無駄なAPI呼び出し・ログ出力を避ける）。
if [ "$CURRENT_HHMM" -lt "1635" ]; then
  echo "[$(timestamp)] Outside evening window (16:35-23:59 JST, now ${CURRENT_HHMM}). Skip." >> "$LOG_FILE"
  exit 0
fi

if ! wait_for_webserver "$LOG_FILE"; then
  echo "[$(timestamp)] ERROR: Webサーバーが約60秒待っても起動しませんでした。処理を中断します。" >> "$LOG_FILE"
  exit 1
fi

http_code=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" --max-time 300 -X POST "$API_URL")
curl_exit=$?

if [ $curl_exit -ne 0 ]; then
  echo "[$(timestamp)] ERROR: evening-orchestrate APIのcurlが失敗しました（exit code $curl_exit）。" >> "$LOG_FILE"
  exit 1
fi

if [ "$http_code" != "200" ]; then
  body=$(head -c 500 "$RESPONSE_FILE" 2>/dev/null)
  echo "[$(timestamp)] ERROR (HTTP $http_code): $body" >> "$LOG_FILE"
  exit 1
fi

summary=$(node -e '
  const fs = require("fs");
  try {
    const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
    const r = d.record;
    console.log(`successStep=${r.successStep} failedStep=${r.failedStep} skipReason=${r.skipReason ?? "-"} errorReason=${r.errorReason ?? "-"} paperTradingCompletedAt=${r.paperTradingCompletedAt ?? "-"} verificationSettledAt=${r.verificationSettledAt ?? "-"} dailyRecordGeneratedAt=${r.dailyRecordGeneratedAt ?? "-"} milestonesProcessedAt=${r.milestonesProcessedAt ?? "-"}`);
  } catch { console.log("(レスポンス解析失敗)"); }
' "$RESPONSE_FILE" 2>/dev/null)

success=$(node -e '
  const fs = require("fs");
  try {
    const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
    console.log(d.record && d.record.successStep === "milestones" ? "true" : "false");
  } catch { console.log("false"); }
' "$RESPONSE_FILE" 2>/dev/null)

skipped=$(node -e '
  const fs = require("fs");
  try {
    const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
    console.log(d.record && d.record.skipReason ? "true" : "false");
  } catch { console.log("false"); }
' "$RESPONSE_FILE" 2>/dev/null)

if [ "$skipped" = "true" ]; then
  # API側のガード（非営業日・16:35より前）で何も実行しなかった場合。スクリプト自身の事前
  # チェックと同じ理由のはずだが、念のためAPI側でも弾かれたことをログに残すだけで
  # エラー扱いにはしない（完了マーカーも作らず、次回のキャッチアップ起動に委ねる）。
  echo "[$(timestamp)] SKIPPED (API guard): $summary" >> "$LOG_FILE"
  exit 0
fi

if [ "$success" = "true" ]; then
  echo "[$(timestamp)] SUCCESS: $summary" >> "$LOG_FILE"
  touch "$DONE_MARKER"
  exit 0
fi

echo "[$(timestamp)] PARTIAL/FAILED: $summary" >> "$LOG_FILE"
echo "[$(timestamp)] 完了マーカーは作成しません。次回のキャッチアップ起動で自動的に再試行されます（各段は冪等）。" >> "$LOG_FILE"
exit 1
