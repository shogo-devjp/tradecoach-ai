import { NextResponse } from "next/server";
import { getPortfolioHistory, getPortfolioState } from "@/app/lib/paperTrading/portfolioManager";
import { getStrategyConfig, STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { apiError } from "@/app/lib/api/response";

export async function GET() {
  try {
    const config = await getStrategyConfig(STRATEGY_A_ID);
    const [state, history] = await Promise.all([
      getPortfolioState(STRATEGY_A_ID, config.initialCapital),
      getPortfolioHistory(STRATEGY_A_ID),
    ]);
    return NextResponse.json({ config, state, history });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
