import { NextResponse } from "next/server";
import { settlePendingRecords } from "@/app/lib/verification/settle";
import { aggregateVerification } from "@/app/lib/verification/aggregate";
import { apiError } from "@/app/lib/api/response";

// 呼ばれるたびに未確定レコードの決済（翌営業日/3営業日後/5営業日後の騰落率確定）を行ってから
// 集計結果を返す。cronのような定期実行はないため、ページ閲覧時に都度追いつかせる設計にしている。
export async function GET() {
  try {
    const records = await settlePendingRecords();
    const stats = aggregateVerification(records);
    return NextResponse.json({ records, stats });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
