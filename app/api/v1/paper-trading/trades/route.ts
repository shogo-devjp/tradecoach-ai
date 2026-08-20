import { NextResponse } from "next/server";
import { getTrades, getExecutionLog } from "@/app/lib/paperTrading/portfolioManager";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { apiError } from "@/app/lib/api/response";

export async function GET() {
  try {
    const [trades, executionLog] = await Promise.all([getTrades(STRATEGY_A_ID), getExecutionLog(STRATEGY_A_ID)]);
    return NextResponse.json({ trades, executionLog });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
