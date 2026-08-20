import { NextResponse } from "next/server";
import { settlePendingUniverseVerificationRecords } from "@/app/lib/universeVerification/settle";
import { apiError } from "@/app/lib/api/response";

// 1/3/5営業日後が経過したuniverseVerificationレコードについて、実際の値動きを確定する。
// 既存verification/settle.tsのロジックをそのまま再利用（app/lib/universeVerification/settle.ts参照）。
// 既存30銘柄verification（app/lib/verification/data/log.json）には一切書き込まない。
export async function GET() {
  try {
    const result = await settlePendingUniverseVerificationRecords();
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
