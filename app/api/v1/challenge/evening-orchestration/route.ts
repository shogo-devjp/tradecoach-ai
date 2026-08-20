import { NextResponse } from "next/server";
import { getEveningOrchestrationRecord, listEveningOrchestrationRecords } from "@/app/lib/challenge/eveningOrchestrationStore";
import { apiError } from "@/app/lib/api/response";

// 動作確認・dry-run確認・エラー箇所特定用の閲覧専用エンドポイント。
// ?date=YYYY-MM-DDで当日分のみ、省略時は全件。
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (date) {
      const record = await getEveningOrchestrationRecord(date);
      return NextResponse.json({ record });
    }
    const records = await listEveningOrchestrationRecords();
    return NextResponse.json({ count: records.length, records });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
