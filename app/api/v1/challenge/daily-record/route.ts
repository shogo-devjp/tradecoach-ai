import { NextResponse } from "next/server";
import { generateDailyRecordAndMilestones } from "@/app/lib/challenge/dailyOrchestration";
import { getDailyRecord, readDailyRecords } from "@/app/lib/challenge/store";
import { apiError } from "@/app/lib/api/response";

function todayKeyJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// 想定呼び出しタイミング（§10）：その日のPOST /api/v1/paper-trading/run（EXIT/ENTRY処理）と
// Universe Verification settleが完了した後。Paper Trading本体のPaperPortfolioSnapshotを
// 読み取って転記するだけで、Paper Trading本体・225銘柄Verificationへは一切書き込まない。
// 冪等：同一日に複数回呼んでも二重生成しない。
// Paper Trading本体のSnapshot未確定（当日runがまだ）の場合はfail-safeでrecordCreated:falseを返す。
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? todayKeyJst();

  try {
    const result = await generateDailyRecordAndMilestones({ date });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}

// 読み取り専用。?date=YYYY-MM-DDで単日、省略時は全件（date昇順）。
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (date) {
      const record = await getDailyRecord(date);
      return NextResponse.json({ record });
    }
    const records = await readDailyRecords();
    return NextResponse.json({ count: records.length, records });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
