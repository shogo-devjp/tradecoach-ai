import { NextResponse } from "next/server";
import { runEveningOrchestration } from "@/app/lib/challenge/eveningOrchestration";
import { apiError } from "@/app/lib/api/response";

// 夕方統合オーケストレーション（16:35頃想定）：
// ①Paper Trading run → ②Universe Verification settle → ③Challenge Daily Record生成 →
// ④Milestone判定 を「前段が正常完了した場合のみ次段へ進む」順で1回のリクエストで実行する。
// ③④の失敗は①②の確定済みデータを一切書き換えない（Paper TradingがSSOT）。
// 冪等：同一日に複数回呼んでも二重約定・二重Daily Record・二重Milestoneは発生しない。
export async function POST() {
  try {
    const result = await runEveningOrchestration();
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
