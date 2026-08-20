#!/bin/bash
# 本番Webサーバー(127.0.0.1:3000)がHTTP応答可能になるまで待つ共通処理。Version 1.4.1で追加。
# run-morning-signal.sh / run-evening-settle.sh の両方から `source` して使う。
#
# Mac復帰時にcom.tradecoachai.webserverと朝/夕LaunchAgentのRunAtLoadがほぼ同時に走ると、
# Webサーバーの起動が間に合わずcurlがexit code 7（接続失敗）になる事故が実際に発生したため、
# 呼び出し元のAPI処理を始める前にこの関数で待機する。
#
# 使い方:
#   source "$PROJECT_DIR/scripts/lib/wait-for-webserver.sh"
#   if ! wait_for_webserver "$LOG_FILE"; then
#     echo "..." >> "$LOG_FILE"
#     exit 1
#   fi
#
# 呼び出し元は、この関数がfalseを返した場合、当日実行済みマーカーを作成しないこと
# （次回のキャッチアップ機会を残すため）。

WEBSERVER_URL="http://127.0.0.1:3000/"
WEBSERVER_WAIT_INTERVAL_SEC=5
WEBSERVER_WAIT_MAX_ATTEMPTS=12  # 5秒 x 12回 = 最大約60秒

# $1: ログファイルパス
# 戻り値: 0=HTTP 200を確認できた（続行してよい） / 1=最大待機時間内に確認できなかった
wait_for_webserver() {
  local log_file="$1"
  local attempt
  local http_code

  for attempt in $(seq 1 "$WEBSERVER_WAIT_MAX_ATTEMPTS"); do
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$WEBSERVER_URL" 2>/dev/null)
    if [ "$http_code" = "200" ]; then
      echo "[$(date "+%Y-%m-%d %H:%M:%S %Z")] TradeCoach webserver ready." >> "$log_file"
      return 0
    fi
    echo "[$(date "+%Y-%m-%d %H:%M:%S %Z")] Waiting for TradeCoach webserver... attempt ${attempt}/${WEBSERVER_WAIT_MAX_ATTEMPTS}" >> "$log_file"
    sleep "$WEBSERVER_WAIT_INTERVAL_SEC"
  done

  return 1
}
