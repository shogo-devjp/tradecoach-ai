import { NextResponse } from "next/server";
import { getCachedScan } from "@/app/lib/screening/cache";
import { captureSnapshotForStrategy } from "@/app/lib/paperTrading/engine";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { apiError } from "@/app/lib/api/response";

// 朝スクリーニング（POST /api/v1/screening/signals）が正常完了したことを確認した直後に呼ぶ。
// getCachedScan()（プロセスメモリ、既存の screening/cache.ts をそのまま読むだけ）の内容をコピーし、
// signal-snapshots.json へ凍結保存する。9:00 JSTより前・当日未捕捉の場合のみ書き込みが発生する
// （冪等。verification/screeningの既存ファイルへの書き込みは一切行わない）。
export async function POST() {
  try {
    const cached = getCachedScan();
    const result = await captureSnapshotForStrategy({
      strategyId: STRATEGY_A_ID,
      cachedScan: cached
        ? {
            dateKey: cached.dateKey,
            scanStartedAt: cached.scanStartedAt,
            scannedAt: cached.scannedAt,
            scannedCount: cached.scannedCount,
            failedCount: cached.failedCount,
            candidates: cached.candidates,
          }
        : null,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
