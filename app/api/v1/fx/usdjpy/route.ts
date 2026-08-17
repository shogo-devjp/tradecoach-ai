import { NextResponse } from "next/server";
import { fetchFxAnalysis } from "@/app/lib/fx/fetchFxAnalysis";
import { getFxPair } from "@/app/lib/fx/config/pairs";
import { apiError } from "@/app/lib/api/response";

// Phase 1はUSD/JPYのみ対応のため固定ルートにする。
// 通貨ペアを追加する際は、fetchFxAnalysis自体は既に汎用（FxPairCodeを受け取る）ため、
// 同じ形のフォルダ（例：app/api/v1/fx/eurjpy/route.ts）を追加するだけで拡張できる。
export async function GET() {
  try {
    const pairDef = getFxPair("USDJPY");
    if (!pairDef.enabled) {
      return NextResponse.json({ error: "USD/JPYは現在無効化されています" }, { status: 400 });
    }

    const result = await fetchFxAnalysis("USDJPY");
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
