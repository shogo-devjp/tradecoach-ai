import { NextResponse } from "next/server";
import { listStrategyHistory, recordStrategyChange } from "@/app/lib/challenge/strategyHistory";
import { apiError } from "@/app/lib/api/response";

// Strategy変更は人間の判断による重要イベントのため、朝夕の自動処理からは呼ばず手動で記録する。
// 過去のエントリを上書きすることはない（追記専用・冪等）。
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await recordStrategyChange(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}

// 読み取り専用。
export async function GET() {
  try {
    const history = await listStrategyHistory();
    return NextResponse.json({ count: history.length, history });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
