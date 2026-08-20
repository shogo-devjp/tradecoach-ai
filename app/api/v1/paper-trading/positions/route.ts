import { NextResponse } from "next/server";
import { getAllPositions } from "@/app/lib/paperTrading/portfolioManager";
import { STRATEGY_A_ID } from "@/app/lib/paperTrading/config";
import { apiError } from "@/app/lib/api/response";

export async function GET() {
  try {
    const positions = await getAllPositions(STRATEGY_A_ID);
    return NextResponse.json({ positions });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
