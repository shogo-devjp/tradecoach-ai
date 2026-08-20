import { NextResponse } from "next/server";
import { readUniverseVerificationLog } from "@/app/lib/universeVerification/store";
import { apiError } from "@/app/lib/api/response";

// 動作確認・dry-run確認用の閲覧エンドポイント（?date=YYYY-MM-DDで絞り込み可能）。
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const records = await readUniverseVerificationLog();
    const filtered = date ? records.filter((r) => r.date === date) : records;
    return NextResponse.json({ count: filtered.length, records: filtered });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
