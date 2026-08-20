import { NextResponse } from "next/server";
import { initializeUniverseVerification } from "@/app/lib/universeVerification/initialize";
import { apiError } from "@/app/lib/api/response";

function todayKeyJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// 朝Snapshot（POST /api/v1/paper-trading/snapshot、Paper Tradingと共有する唯一の判断ソース）
// が正常完了したことを確認した後に呼ぶ。当日のSignal Snapshotから225銘柄全件分の
// universeVerificationレコード（pending状態）を作成する。冪等：同一date+codeなら再実行しても
// 二重記録されない。verification（既存30銘柄）・screeningキャッシュへの書き込みは一切行わない。
export async function POST() {
  try {
    const result = await initializeUniverseVerification(todayKeyJst());
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
