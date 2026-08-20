import { NextResponse } from "next/server";
import { activateChallenge } from "@/app/lib/challenge/challengeMeta";
import { apiError } from "@/app/lib/api/response";

// 本稼働開始日（startedAt）を一度だけ確定する。既にactive済みの場合は何もしない（冪等）。
// 重要：今回のタスクではこのエンドポイントを実運用で呼び出さない（本稼働開始は別途指示があるまで
// 行わない）。実装・テストのみ。
export async function POST() {
  try {
    const result = await activateChallenge();
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return apiError(error);
  }
}
