import { NextResponse } from "next/server";
import { settlePendingUniverseVerificationRecords } from "@/app/lib/universeVerification/settle";
import { apiError } from "@/app/lib/api/response";

// 1/3/5営業日後が経過したuniverseVerificationレコードについて、実際の値動きを確定する。
// 既存verification/settle.tsのロジックをそのまま再利用（app/lib/universeVerification/settle.ts参照）。
// 既存30銘柄verification（app/lib/verification/data/log.json）には一切書き込まない。
//
// day1/day3/day5/outcomeを書き込む状態変更処理のため、誤呼び出し防止としてPOSTのみを許可する
// （読み取り専用の一覧取得は /api/v1/universe-verification/records を使う）。
export async function POST() {
  try {
    const result = await settlePendingUniverseVerificationRecords();
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
