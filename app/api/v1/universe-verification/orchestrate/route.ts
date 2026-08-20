import { NextResponse } from "next/server";
import { runMorningOrchestration } from "@/app/lib/universeVerification/morningOrchestration";
import { apiError } from "@/app/lib/api/response";

// 朝スクリーニング（POST /api/v1/screening/signals、既存の8:30 LaunchAgent）が正常完了したことを
// 確認した直後に1回だけ呼ぶ想定のエンドポイント。固定時刻（例:8:33）に依存せず、
// ③Snapshot固定 → ④Verification初期化 を「前段の正常完了」をトリガーに直列で実行する。
// スクリプト側（run-paper-signal-snapshot.sh）はこのURLをポーリングで叩くだけで、
// 分岐ロジック自体は持たない（既存の設計方針を踏襲）。
// 既存30銘柄verification・screeningキャッシュ・本番LINE通知には一切書き込まない。
export async function POST() {
  try {
    const result = await runMorningOrchestration();
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
