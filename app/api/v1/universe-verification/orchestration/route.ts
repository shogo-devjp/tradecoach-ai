import { NextResponse } from "next/server";
import { getMorningOrchestrationRecord, listMorningOrchestrationRecords } from "@/app/lib/universeVerification/orchestrationStore";
import { apiError } from "@/app/lib/api/response";

// 動作確認・dry-run確認用の閲覧専用エンドポイント（?date=YYYY-MM-DDで当日分のみ、省略時は全件）。
// 状態変更は行わない。
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (date) {
      const record = await getMorningOrchestrationRecord(date);
      return NextResponse.json({ record });
    }
    const records = await listMorningOrchestrationRecords();
    return NextResponse.json({ count: records.length, records });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
