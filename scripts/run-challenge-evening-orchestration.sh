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
NOTIFY_API_URL="http://localhost:3000/api/v1/challenge/notify-daily-result"
RESPONSE_FILE="$(mktemp /tmp/tradecoach-challenge-evening-XXXXXX.json)"
NOTIFY_RESPONSE_FILE="$(mktemp /tmp/tradecoach-challenge-notify-XXXXXX.json)"

source "$PROJECT_DIR/scripts/lib/wait-for-webserver.sh"

mkdir -p "$LOG_DIR" "$STATE_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S %Z"
}

cleanup() {
  rm -f "$RESPONSE_FILE" "$NOTIFY_RESPONSE_FILE"
}
trap cleanup EXIT

# 「運用処理」（evening-orchestrate）とは完全に別のAPI呼び出しとしてLINE通知を行う。
# 通知の成否（curl失敗・HTTP非200・send_failed等）はこのスクリプトの終了コード・完了マーカーには
# 一切影響させない（通知はログに記録するだけで、evening-orchestrate自体の成否判定より後、
# かつその判定結果に関わらず必ず1回だけ試みる。非営業日等でevening-orchestrate自体をスキップ
# した場合は、この関数を呼ばない＝通知しない）。
#
# v1.9: evening-orchestrateのcurl自体がタイムアウト等で失敗しても（Macの再スリープでクライアント
# 側が先にタイムアウトし、サーバー側は数秒〜数十秒後に処理を完了しているケースが2026-09-07に
# 実際に発生した）、notify-daily-resultだけを短時間ポーリングして後から結果通知を回収できるようにする。
# notify-daily-resultはEveningOrchestrationRecordを読むだけの読み取り専用API（Paper Trading・
# verificationには一切書き込まない）なので、何度呼んでも実害はない。また実際の送信可否は
# notifyOnceToday()のkind別永続マーカーで冪等化されているため、ポーリングで複数回叩いても
# LINEは当日最大1通（結果通知）・1通（エラー通知）に保たれる。
# Paper Trading本体（evening-orchestrate）はここでは再実行しない。
NOTIFY_POLL_INTERVAL_SEC=20
NOTIFY_POLL_MAX_ATTEMPTS=6 # 20秒 x 6回 = 最大約2分

notify_daily_result() {
  local attempt
  local notify_http_code
  local notify_curl_exit
  local outcome

  for attempt in $(seq 1 "$NOTIFY_POLL_MAX_ATTEMPTS"); do
    notify_http_code=$(curl -s -o "$NOTIFY_RESPONSE_FILE" -w "%{http_code}" --max-time 60 -X POST "$NOTIFY_API_URL")
    notify_curl_exit=$?

    if [ $notify_curl_exit -ne 0 ]; then
      echo "[$(timestamp)] NOTIFY WARN: notify-daily-result APIのcurlが失敗しました（exit code $notify_curl_exit, attempt ${attempt}/${NOTIFY_POLL_MAX_ATTEMPTS}）。Paper Trading確定データへの影響はありません。" >> "$LOG_FILE"
    elif [ "$notify_http_code" != "200" ]; then
      local notify_body
      notify_body=$(head -c 300 "$NOTIFY_RESPONSE_FILE" 2>/dev/null)
      echo "[$(timestamp)] NOTIFY WARN (HTTP $notify_http_code, attempt ${attempt}/${NOTIFY_POLL_MAX_ATTEMPTS}): $notify_body" >> "$LOG_FILE"
    else
      outcome=$(node -e '
        const fs = require("fs");
        try {
          const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
          console.log(d.outcome ?? "");
        } catch { console.log(""); }
      ' "$NOTIFY_RESPONSE_FILE" 2>/dev/null)

      local notify_summary
      notify_summary=$(node -e '
        const fs = require("fs");
        try {
          const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
          console.log(`outcome=${d.outcome} detail=${d.detail ?? "-"}`);
        } catch { console.log("(レスポンス解析失敗)"); }
      ' "$NOTIFY_RESPONSE_FILE" 2>/dev/null)

      case "$outcome" in
        sent_result|sent_error|already_notified)
          echo "[$(timestamp)] NOTIFY: $notify_summary (attempt ${attempt}/${NOTIFY_POLL_MAX_ATTEMPTS})" >> "$LOG_FILE"
          return
          ;;
        skipped_not_ready)
          echo "[$(timestamp)] NOTIFY: $notify_summary (attempt ${attempt}/${NOTIFY_POLL_MAX_ATTEMPTS}, サーバー側の処理完了待ちのため再確認します)" >> "$LOG_FILE"
          ;;
        *)
          # skipped_non_trading_day等、それ以上リトライしても状況が変わらない結果はここで確定して終わる。
          echo "[$(timestamp)] NOTIFY: $notify_summary (attempt ${attempt}/${NOTIFY_POLL_MAX_ATTEMPTS})" >> "$LOG_FILE"
          return
          ;;
      esac
    fi

    if [ "$attempt" -lt "$NOTIFY_POLL_MAX_ATTEMPTS" ]; then
      sleep "$NOTIFY_POLL_INTERVAL_SEC"
    fi
  done

  echo "[$(timestamp)] NOTIFY WARN: ${NOTIFY_POLL_MAX_ATTEMPTS}回のポーリングでも結果通知を確定できませんでした（サーバー側が未完了の可能性）。次回のキャッチアップ起動で自動的に再試行されます。" >> "$LOG_FILE"
}

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
  # v1.9: クライアント側のcurlが失敗しても、サーバー側では処理が継続・完了している可能性がある
  # （Macの再スリープでクライアントが先にタイムアウトするケースが2026-09-07に実際発生した）。
  # このスクリプトからevening-orchestrateを再実行することはせず、結果の確認だけをポーリングで試みる。
  # 完了マーカー（$DONE_MARKER）はここでは作らない＝次回のキャッチアップ起動でevening-orchestrate
  # 自体の再試行（冪等）にも委ねられる。
  notify_daily_result
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
  notify_daily_result
  exit 0
fi

echo "[$(timestamp)] PARTIAL/FAILED: $summary" >> "$LOG_FILE"
echo "[$(timestamp)] 完了マーカーは作成しません。次回のキャッチアップ起動で自動的に再試行されます（各段は冪等）。" >> "$LOG_FILE"
notify_daily_result
exit 1
