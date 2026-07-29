import { NextResponse } from "next/server";
import { analyzeStockByCode } from "@/app/lib/stockAnalysis";
import { apiError } from "@/app/lib/api/response";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "銘柄コードがありません" }, { status: 400 });
    }

    const result = await analyzeStockByCode(code);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
