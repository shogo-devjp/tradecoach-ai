import { NextResponse } from "next/server";
import { runDaily } from "@/app/lib/paperTrading/engine";
import { yahooBarProvider } from "@/app/lib/paperTrading/yahooBarProvider";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { apiError } from "@/app/lib/api/response";

// 当日の日足Open/High/Low/Closeが確定した後（16:35目安）に呼ぶ。
// signal-snapshots.jsonのみを参照して約定・EXITを確定する（verification・screeningキャッシュは
// 一切参照しない）。冪等：同一dateに対して複数回呼んでも二重約定しない。
// ?dryRun=true を付けるとファイルへの書き込みを一切行わず、結果だけを返す。
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "true";

  try {
    const result = await runDaily({
      strategyId: STRATEGY_A_ID,
      dryRun,
      barProvider: yahooBarProvider,
      benchmarkBarProvider: yahooBarProvider,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
