import { NextResponse } from "next/server";
import { analyzeFxPairById } from "@/app/lib/fx/fxAnalysis";
import { apiError } from "@/app/lib/api/response";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get("pair") ?? "USDJPY";

    const result = await analyzeFxPairById(pair);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
