import { NextResponse } from "next/server";
import { getTrades, getPortfolioHistory } from "@/app/lib/paperTrading/portfolioManager";
import { computePerformanceMetrics } from "@/app/lib/paperTrading/performanceMetrics";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { apiError } from "@/app/lib/api/response";

export async function GET() {
  try {
    const [trades, history] = await Promise.all([getTrades(STRATEGY_A_ID), getPortfolioHistory(STRATEGY_A_ID)]);
    const metrics = computePerformanceMetrics(trades, history);
    return NextResponse.json({ metrics });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
