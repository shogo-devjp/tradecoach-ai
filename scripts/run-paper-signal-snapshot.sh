#!/bin/bash
# Paper Trading（Phase 1）＋ 225銘柄Verification 朝処理。朝スクリーニング
# （com.tradecoachai.morningsignal）完了後に起動し、POST /api/v1/universe-verification/orchestrate
# をポーリングする。このAPIは「③スキャン完了確認後にSnapshot固定 → ④固定成功を確認した直後に
# Verification 225件をinitialize」までを1回のリクエストで直列実行する（固定時刻依存を廃止し、
# 前段の正常完了をトリガーに次段を直後に実行する設計。app/lib/universeVerification/
# morningOrchestration.ts参照）。
#
# 設計方針（設計書§7・§12）：
# - このスクリプトはビジネスロジックを一切持たない。捕捉できるかどうか（対象銘柄数・成功/失敗件数・
#   9:00締切）の判断はすべてAPI側（app/lib/universeVerification/morningOrchestration.ts,
#   paperTrading/engine.ts, signalSnapshotStore.ts）が行う。
#   スクリプトは「決まったURLを繰り返し叩いてログを残すだけ」。
# - 将来Windows専用PCへ移行する際は、このスクリプトとplistだけをタスクスケジューラ用に
#   置き換えれば良く、Engine・APIルートには一切手を入れない。
#
# 既存の朝夕バッチ（run-morning-signal.sh / run-evening-settle.sh）・既存30銘柄verification・
# LINE通知には一切触れない（Snapshot/Verification APIを叩くだけ）。
set -u

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/paper-signal-snapshot.log"
STATE_DIR="$PROJECT_DIR/logs/state"
SNAPSHOT_API_URL="http://localhost:3000/api/v1/universe-verification/orchestrate"
RESPONSE_FILE="$(mktemp /tmp/tradecoach-paper-snapshot-XXXXXX.json)"

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
SNAPSHOT_MARKER="$STATE_DIR/paper-snapshot-done-$TODAY_JST"
CURRENT_HHMM="$(TZ=Asia/Tokyo date +%H%M)"

# ポーリング設定: 30秒間隔、最大18回（=9分）。9:00 JSTの締切はAPI側でも判定するため、
# ここでの打ち切りは「無駄なポーリングを続けない」ための保険にすぎない。
POLL_INTERVAL_SEC=30
POLL_MAX_ATTEMPTS=18

# 1) 休場日チェック（朝と同じロジック・同じスクリプトを共有）。
if ! node "$PROJECT_DIR/scripts/check-market-open.mjs" 2>>"$LOG_FILE"; then
  echo "[$(timestamp)] Market closed. Skip paper snapshot." >> "$LOG_FILE"
  exit 0
fi

# 1.5) 当日すでに捕捉試行済みなら何もしない。
if [ -f "$SNAPSHOT_MARKER" ]; then
  echo "[$(timestamp)] Paper snapshot already attempted today. Skip (marker: $SNAPSHOT_MARKER)." >> "$LOG_FILE"
  exit 0
fi

# 1.6) キャッチアップ安全窓: 08:30〜09:00 JSTのみ実行を許可する（9:00締切のため、これより後の
#      実行は意味がない。API側もafter_market_openとして拒否する）。
if [ "$CURRENT_HHMM" -lt "0830" ] || [ "$CURRENT_HHMM" -gt "0900" ]; then
  echo "[$(timestamp)] Outside snapshot window (08:30-09:00 JST, now ${CURRENT_HHMM}). Skip." >> "$LOG_FILE"
  exit 0
fi

if ! wait_for_webserver "$LOG_FILE"; then
  echo "[$(timestamp)] ERROR: Webサーバーが約60秒待っても起動しませんでした。処理を中断します。" >> "$LOG_FILE"
  exit 1
fi

# 2) スキャン完了確認後にSnapshotが保存されるまでポーリングする。
for attempt in $(seq 1 "$POLL_MAX_ATTEMPTS"); do
  http_code=$(curl -s -o "$RESPONSE_FILE" -w "%{http_code}" --max-time 30 -X POST "$SNAPSHOT_API_URL")
  curl_exit=$?

  if [ $curl_exit -ne 0 ]; then
    echo "[$(timestamp)] WARN: snapshot APIのcurlが失敗しました（exit code $curl_exit, attempt ${attempt}/${POLL_MAX_ATTEMPTS}）。" >> "$LOG_FILE"
  elif [ "$http_code" = "200" ]; then
    captured=$(node -e '
      const fs = require("fs");
      try {
        const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
        console.log(d.snapshot && d.snapshot.captured === true ? "true" : "false");
      } catch { console.log("false"); }
    ' "$RESPONSE_FILE" 2>/dev/null)

    summary=$(node -e '
      const fs = require("fs");
      try {
        const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
        const s = d.snapshot ?? {};
        const v = d.verification ?? null;
        console.log(`captured=${s.captured} reason=${s.reason ?? "-"} universeSize=${s.universeSize ?? "-"} succeededCount=${s.succeededCount ?? "-"} failedCount=${s.failedCount ?? "-"} verificationInitialized=${v ? v.initialized : "-"} verificationCreatedCount=${v ? v.createdCount : "-"}`);
      } catch { console.log("(レスポンス解析失敗)"); }
    ' "$RESPONSE_FILE" 2>/dev/null)

    if [ "$captured" = "true" ]; then
      echo "[$(timestamp)] SUCCESS: $summary" >> "$LOG_FILE"
      touch "$SNAPSHOT_MARKER"
      exit 0
    fi

    # after_market_openの場合はこれ以上ポーリングしても無意味なので即終了する。
    reason=$(node -e '
      const fs = require("fs");
      try {
        const d = JSON.parse(fs.readFileSync(process.argv[1], "utf-8"));
        console.log((d.snapshot && d.snapshot.reason) ?? "");
      } catch { console.log(""); }
    ' "$RESPONSE_FILE" 2>/dev/null)
    if [ "$reason" = "after_market_open" ]; then
      echo "[$(timestamp)] STOP: 9:00 JSTを過ぎたためSnapshot/Verificationを作成しませんでした（fail-safe。当日は新規BUYなし・225件verificationも作成なし）: $summary" >> "$LOG_FILE"
      touch "$SNAPSHOT_MARKER"
      exit 0
    fi

    echo "[$(timestamp)] Not ready yet (attempt ${attempt}/${POLL_MAX_ATTEMPTS}): $summary" >> "$LOG_FILE"
  else
    echo "[$(timestamp)] WARN: HTTP $http_code (attempt ${attempt}/${POLL_MAX_ATTEMPTS})" >> "$LOG_FILE"
  fi

  sleep "$POLL_INTERVAL_SEC"
done

echo "[$(timestamp)] ERROR: ${POLL_MAX_ATTEMPTS}回のポーリングでもSnapshotを捕捉できませんでした。次回のキャッチアップで再試行してください。" >> "$LOG_FILE"
exit 1
