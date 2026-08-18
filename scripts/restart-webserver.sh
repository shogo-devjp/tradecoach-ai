#!/bin/bash
# コード変更後に本番Webサーバー（com.tradecoachai.webserver, 127.0.0.1:3000）を
# 安全に再デプロイするためのスクリプト。Version 1.4で追加。
# Claude Codeでの開発が一段落した後、手動でこのスクリプトを実行する想定
# （このスクリプト自体はLaunchAgentからは呼ばれない）。
#
# 手順: 1) npm run build → 2) build成功確認 → 3) 本番サーバーをkickstartで再起動 →
#       4) HTTP 200を確認 → 5) 失敗時はログを残す。
#
# 重要: buildに失敗した場合、現在動いている本番サーバーには一切触れない
#       （壊れたビルドに差し替えて丸ごとダウンさせることを防ぐ）。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/webserver.log"
LABEL="com.tradecoachai.webserver"
PORT=3000

mkdir -p "$LOG_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S %Z"
}

cd "$PROJECT_DIR" || {
  echo "[$(timestamp)] ERROR: プロジェクトディレクトリへ移動できませんでした ($PROJECT_DIR)" >> "$LOG_FILE"
  exit 1
}

echo "[$(timestamp)] Redeploy: npm run build を開始します" >> "$LOG_FILE"

build_started=$(date +%s)
if ! npm run build >> "$LOG_FILE" 2>&1; then
  build_elapsed=$(( $(date +%s) - build_started ))
  echo "[$(timestamp)] ERROR: buildに失敗しました（${build_elapsed}s）。現在稼働中の本番サーバーはそのまま維持します。詳細は $LOG_FILE を確認してください。" >> "$LOG_FILE"
  exit 1
fi
build_elapsed=$(( $(date +%s) - build_started ))
echo "[$(timestamp)] build成功（${build_elapsed}s）" >> "$LOG_FILE"

# 本番サーバーを再起動する。LaunchAgentが未登録の場合はエラーになるため、
# 事前に launchctl load -w ~/Library/LaunchAgents/com.tradecoachai.webserver.plist が必要。
if ! launchctl kickstart -k "gui/$(id -u)/$LABEL" >> "$LOG_FILE" 2>&1; then
  echo "[$(timestamp)] ERROR: launchctl kickstartに失敗しました。LaunchAgentが登録されているか確認してください（launchctl list | grep $LABEL）。" >> "$LOG_FILE"
  exit 1
fi

echo "[$(timestamp)] kickstart実行、起動確認を開始します" >> "$LOG_FILE"

# next startの起動には数秒かかるため、HTTP 200になるまで最大15秒リトライする。
ok=false
for i in $(seq 1 15); do
  sleep 1
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:${PORT}/" 2>/dev/null)
  if [ "$http_code" = "200" ]; then
    ok=true
    break
  fi
done

if [ "$ok" = true ]; then
  echo "[$(timestamp)] SUCCESS: 再デプロイ完了、HTTP 200を確認しました（${i}秒待機）" >> "$LOG_FILE"
  exit 0
else
  echo "[$(timestamp)] ERROR: 再起動後もHTTP 200を確認できませんでした（最終HTTPコード: ${http_code:-取得失敗}）。logs/webserver.log とlaunchctl print gui/$(id -u)/$LABEL を確認してください。" >> "$LOG_FILE"
  exit 1
fi
