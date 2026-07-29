import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { getMarketRegime } from "@/app/lib/marketRegime/marketRegime";
import { apiError } from "@/app/lib/api/response";

const yahooFinance = new YahooFinance();

// MarketCard表示用。日経平均・TOPIX・地合いコメントに加えて、USD/JPYも実データで返す
// （USD/JPYはテクニカル分析には使わない軽量な参考表示のため、quote()の単発呼び出しのみ）。
export async function GET() {
  try {
    const [marketRegime, usdJpyQuote] = await Promise.all([getMarketRegime(), yahooFinance.quote("JPY=X")]);

    return NextResponse.json({
      marketRegime,
      usdJpy: usdJpyQuote.regularMarketPrice ?? null,
    });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
