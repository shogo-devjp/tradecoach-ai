import { NextResponse } from "next/server";
import { ensureChallengeInitialized } from "@/app/lib/challenge/challengeMeta";
import { apiError } from "@/app/lib/api/response";

// Challenge準備状態（status: "preparing"、startedAt: null）を作成する。既に存在する場合は
// そのまま返すだけで上書きしない。本稼働開始（startedAt確定）は別の
// POST /api/v1/challenge/activate でのみ行う（今回のタスクでは呼び出さない）。
export async function POST() {
  try {
    const meta = await ensureChallengeInitialized();
    return NextResponse.json({ meta });
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
