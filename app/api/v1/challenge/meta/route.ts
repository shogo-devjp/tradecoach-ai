import { NextResponse } from "next/server";
import { readChallengeMeta } from "@/app/lib/challenge/store";
import { apiError } from "@/app/lib/api/response";

// 読み取り専用。Dashboard表示用。
export async function GET() {
  try {
    const meta = await readChallengeMeta();
    return NextResponse.json({ meta });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
