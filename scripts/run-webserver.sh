#!/bin/bash
# TradeCoach AIの本番Webサーバー（127.0.0.1:3000）をlaunchd(com.tradecoachai.webserver)から
# 起動するためのラッパー。Version 1.4で追加。
#
# 重要な設計方針:
# - このスクリプトは「起動するだけ」。ビルドはしない。
#   （KeepAliveでクラッシュ後に毎回ビルドし直すと遅く、ビルド失敗時にサーバーが
#   一切上がらなくなるため。コード変更後の再ビルド＋再起動は scripts/restart-webserver.sh
#   が担当する。）
# - 最後に `exec` で next start プロセスに置き換わる。bashを挟んだままだと、
#   launchdが監視するPIDがbashになりKeepAliveの検知が不正確になるため。
# - 起動前にポート3000が別プロセスに使われていないか確認する。使われていた場合は
#   理由をログに残してexit 1する（KeepAliveがThrottleIntervalの間隔で再試行するが、
#   無限に高速リトライはしない・原因はログから追える）。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/webserver.log"
PORT=3000
HOST=127.0.0.1

mkdir -p "$LOG_DIR"

timestamp() {
  date "+%Y-%m-%d %H:%M:%S %Z"
}

cd "$PROJECT_DIR" || {
  echo "[$(timestamp)] ERROR: プロジェクトディレクトリへ移動できませんでした ($PROJECT_DIR)" >> "$LOG_FILE"
  exit 1
}

# ポート3000が既に使われていないか確認する（例: 手動でnpm run devをポート指定せず
# 起動してしまった、以前のnext startプロセスが終了しきれていない、等）。
existing_pid="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | head -1)"
if [ -n "$existing_pid" ]; then
  existing_cmd="$(ps -o command= -p "$existing_pid" 2>/dev/null)"
  echo "[$(timestamp)] ERROR: ポート${PORT}は既に使用中です（PID ${existing_pid}: ${existing_cmd}）。本番サーバーを起動できません。開発用next devは -p 3001 を使ってください。" >> "$LOG_FILE"
  exit 1
fi

if [ ! -d "$PROJECT_DIR/.next" ]; then
  echo "[$(timestamp)] ERROR: .next（ビルド成果物）が見つかりません。先に scripts/restart-webserver.sh または npm run build を実行してください。" >> "$LOG_FILE"
  exit 1
fi

echo "[$(timestamp)] Starting production server on ${HOST}:${PORT}" >> "$LOG_FILE"

# execで置き換えることで、launchdがこのプロセス（node/next start本体）を直接監視できるようにする。
exec npx next start -H "$HOST" -p "$PORT" >> "$LOG_FILE" 2>&1
