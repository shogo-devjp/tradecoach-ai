import { NextResponse } from "next/server";
import { readChallengeMeta, readDailyRecords, readEvents } from "@/app/lib/challenge/store";
import { apiError } from "@/app/lib/api/response";

// Dashboard（app/challenge）表示専用の読み取り集約エンドポイント。複数往復を避けるためだけの
// 便宜的なエンドポイントで、独自の計算は一切行わない（Daily Recordの値をそのまま返すだけ）。
export async function GET() {
  try {
    const [meta, records, events] = await Promise.all([readChallengeMeta(), readDailyRecords(), readEvents()]);
    const latest = records[records.length - 1] ?? null;
    const recentTrades = latest
      ? records
          .slice(-10)
          .flatMap((r) => r.trades)
          .slice(-10)
      : [];
    const recentEvents = events.slice(-10).reverse();
    const equitySeries = records.map((r) => ({
      date: r.date,
      totalAssets: r.totalAssets,
      benchmarkValue: r.benchmarkCurrentValue,
      cumulativeReturnPercent: r.cumulativeReturnPercent,
      benchmarkCumulativeReturnPercent: r.benchmarkCumulativeReturnPercent,
    }));

    return NextResponse.json({ meta, latest, recentTrades, recentEvents, equitySeries });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
